import { Component, OnInit, OnDestroy, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink, Router, ActivatedRoute } from '@angular/router';
import { ChatService, Room, Message } from './chat.service';
import { StateService } from '../core/services/state.service';
@Component({selector:'app-chat',standalone:true,imports:[CommonModule,FormsModule,RouterLink],providers:[ChatService],templateUrl:'./chat.html',styleUrls:['./chat.css']})
export class ChatComponent implements OnInit,OnDestroy {
  draft='';roomName='';isPublic=true;inviteName='';notice=signal('');busy=signal(false);sending=signal(false);
  postId?:number; private pending?:{text:string;id:string;room:string};private shareId=crypto.randomUUID();
  constructor(public C:ChatService, public S:StateService,private router:Router,private route:ActivatedRoute){}
  async ngOnInit(){
    if(!this.S.currentUser()){void this.router.navigateByUrl('/');return}
    const raw=this.route.snapshot.queryParamMap.get('post');
    if(raw && /^\d+$/.test(raw))this.postId=Number(raw);
    this.C.connect();
    try{await this.C.loadRooms()}catch(e){this.C.fail(e)}
  }
  ngOnDestroy(){this.C.disconnect()}
  async refresh(){try{await this.C.loadRooms()}catch(e){this.C.fail(e)}}
  async open(room:Room){this.busy.set(true);try{await this.C.open(room);this.draft='';this.pending=undefined;this.notice.set('')}catch(e){this.C.fail(e)}finally{this.busy.set(false)}}
  async create(){if(!this.roomName.trim())return;this.busy.set(true);try{await this.C.create(this.roomName,this.isPublic,this.postId);this.roomName='';this.notice.set('Room created. Invite people to start collaborating.')}catch(e){this.C.fail(e)}finally{this.busy.set(false)}}
  async send(){
    const text=this.draft.trim(),room=this.C.active()?._id;if(!text||!room||this.sending())return;
    this.C.error.set('');this.sending.set(true);
    if(this.pending?.text!==text||this.pending?.room!==room)this.pending={text,id:crypto.randomUUID(),room};
    try{await this.C.send(text,this.pending!.id);this.draft='';this.pending=undefined}catch(e){this.C.fail(e)}finally{this.sending.set(false)}
  }
  async share(){if(!this.postId)return;try{await this.C.share(this.postId,this.shareId);this.notice.set('Post shared with room members.');this.postId=undefined;void this.router.navigate([],{queryParams:{},replaceUrl:true})}catch(e){this.C.fail(e)}}
  async invite(){if(!this.inviteName.trim())return;try{await this.C.invite(this.inviteName.trim());this.notice.set(`Invitation sent to ${this.inviteName}.`);this.inviteName=''}catch(e){this.C.fail(e)}}
  async remove(name:string){try{await this.C.remove(name);this.notice.set(`${name} removed.`)}catch(e){this.C.fail(e)}}
  async older(){try{await this.C.older()}catch(e){this.C.fail(e)}}
  trackMessage(_i:number,m:Message){return m._id}
  initials(name:string){return name.slice(0,2).toUpperCase()}
}
