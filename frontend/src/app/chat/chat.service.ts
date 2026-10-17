import { Injectable, signal, NgZone } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { io, Socket } from 'socket.io-client';
import { BASE_URL } from '../constants';
export interface Room { _id:string; name:string; owner:string; members:string[]; isPublic:boolean; invited:boolean; joined:boolean; sourcePost?:number; }
export interface Message { _id:string; room:string; sender:string; text:string; clientId:string; createdAt:string; postId?:number; }
@Injectable()
export class ChatService {
  rooms = signal<Room[]>([]);
  active = signal<Room|null>(null);
  messages = signal<Message[]>([]);
  online = signal<string[]>([]);
  typing = signal('');
  status = signal('Connecting');
  error = signal('');
  hasMore = signal(false);
  private socket?: Socket;
  private generation = 0;
  private typingTimer?: ReturnType<typeof setTimeout>;
  constructor(private http:HttpClient, private zone:NgZone) {}
  private request<T>(method:string,path:string,body?:unknown) {
    return firstValueFrom(this.http.request<T>(method,BASE_URL+path,{body,withCredentials:true}));
  }
  async loadRooms() { const res=await this.request<{rooms:Room[]}>('GET','/chat/rooms'); this.rooms.set(res.rooms); }
  connect() {
    this.socket=io(window.location.origin,{withCredentials:true});
    this.socket.on('connect',()=>this.zone.run(()=>{
      this.status.set('Connected');
      const active=this.active(); if(active) void this.open(active).catch(e=>this.fail(e));
    }));
    this.socket.on('disconnect',()=>this.zone.run(()=>{this.status.set('Reconnecting');this.online.set([])}));
    this.socket.on('connect_error',e=>this.zone.run(()=>{this.status.set('Offline');this.error.set(e.message)}));
    this.socket.on('message:new',(message:Message)=>this.zone.run(()=>{
      if(message.room===this.active()?._id) this.merge([message]);
    }));
    this.socket.on('room:presence',({roomId,users}:{roomId:string;users:string[]})=>this.zone.run(()=>{
      if(roomId===this.active()?._id) this.online.set(users);
    }));
    this.socket.on('room:typing',({roomId,username}:{roomId:string;username:string})=>this.zone.run(()=>{
      if(roomId!==this.active()?._id) return;
      this.typing.set(username);clearTimeout(this.typingTimer);
      this.typingTimer=setTimeout(()=>this.typing.set(''),2500);
    }));
    this.socket.on('room:removed',({roomId}:{roomId:string})=>this.zone.run(()=>{
      if(roomId===this.active()?._id){this.active.set(null);this.messages.set([]);this.error.set('You were removed from this room.');}
      void this.loadRooms();
    }));
  }
  private emit(event:string,payload:unknown):Promise<any> {
    return new Promise((resolve,reject)=>{
      if(!this.socket?.connected) return reject(new Error('Connection unavailable. Your draft is kept; retry when connected.'));
      this.socket.timeout(6000).emit(event,payload,(timeout:Error|null,result:any)=>this.zone.run(()=>{
        if(timeout) reject(new Error('Delivery was not confirmed. Retry safely using the same message ID.'));
        else if(result?.error) reject(new Error(result.error));
        else resolve(result);
      }));
    });
  }
  async open(room:Room) {
    const version=++this.generation; this.error.set('');this.active.set(room);this.messages.set([]);this.online.set([]);this.typing.set('');
    if(!room.joined) { await this.request('POST',`/chat/rooms/${room._id}/join`,{}); if(version!==this.generation)return; await this.loadRooms(); }
    await this.emit('room:join',{roomId:room._id});
    const result=await this.request<{messages:Message[];hasMore:boolean}>('GET',`/chat/rooms/${room._id}/messages`);
    if(version!==this.generation) return;
    this.active.set(this.rooms().find(r=>r._id===room._id)||{...room,joined:true});
    this.merge(result.messages);this.hasMore.set(result.hasMore);
  }
  async older() {
    const id=this.active()?._id, first=this.messages()[0]?._id;if(!id||!first)return;
    const result=await this.request<{messages:Message[];hasMore:boolean}>('GET',`/chat/rooms/${id}/messages?before=${first}`);
    if(this.active()?._id!==id)return; this.merge(result.messages);this.hasMore.set(result.hasMore);
  }
  private merge(incoming:Message[]) {
    this.messages.update(current=>[...new Map([...current,...incoming].map(m=>[m._id,m])).values()].sort((a,b)=>a._id.localeCompare(b._id)));
  }
  async send(text:string,clientId:string) {
    const roomId=this.active()?._id; if(!roomId)return;
    const result=await this.emit('message:send',{roomId,text,clientId});
    if(this.active()?._id===roomId) this.merge([result.message]);
  }
  async share(postId:number,clientId:string) {
    const roomId=this.active()?._id;if(!roomId)return;
    const result=await this.request<{message:Message}>('POST',`/chat/rooms/${roomId}/share`,{postId,clientId});
    if(this.active()?._id===roomId) this.merge([result.message]);
  }
  async create(name:string,isPublic:boolean,sourcePost?:number) {
    const res=await this.request<{room:Room}>('POST','/chat/rooms',{name,isPublic,sourcePost});
    await this.loadRooms();await this.open({...res.room,joined:true});
  }
  async invite(username:string) { await this.request('POST',`/chat/rooms/${this.active()?._id}/invite`,{username}); }
  async remove(username:string) {
    const id=this.active()?._id;
    await this.request('DELETE',`/chat/rooms/${id}/members/${encodeURIComponent(username)}`);
    await this.loadRooms(); this.active.set(this.rooms().find(r=>r._id===id)||null);
  }
  notifyTyping(){if(this.socket?.connected)this.socket.emit('room:typing',{roomId:this.active()?._id})}
  fail(e:any){this.error.set(e?.error?.error||e?.message||'Request failed. Please try again.')}
  disconnect(){this.socket?.disconnect();clearTimeout(this.typingTimer)}
}
