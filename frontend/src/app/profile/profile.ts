import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { StateService } from '../core/services/state.service';
import { UsersService } from '../core/services/users.service';
import { BASE_URL } from '../constants';
@Component({selector:'app-profile',standalone:true,imports:[CommonModule,FormsModule,RouterLink],templateUrl:'./profile.html',styleUrls:['./profile.css']})
export class ProfileComponent implements OnInit {
 email='';phone='';zipcode='';password='';
 avatarPreview:string|null=null;private avatarDataUrl:string|null=null;
 avatarErr='';okMsg='';errEmail='';errPhone='';errZip='';errPassword='';busy=signal(false);
 constructor(public S:StateService,private router:Router,private http:HttpClient,private users:UsersService){}
 async ngOnInit(){
  if(!this.S.currentUser()){void this.router.navigateByUrl('/');return}
  try{const user=await firstValueFrom(this.users.getCurrentUser());this.S.setLoggedIn(user,user.catchPhrase,false)}
  catch(e:any){if(e.status===401){this.S.logout();void this.router.navigateByUrl('/')}else this.okMsg='Could not load your profile. Please retry.'}
 }
 onAvatarSelected(event:Event){
  this.avatarErr='';this.avatarDataUrl=null;this.avatarPreview=null;
  const file=(event.target as HTMLInputElement).files?.[0];if(!file)return;
  if(!['image/png','image/jpeg','image/webp','image/gif'].includes(file.type)){this.avatarErr='Choose a PNG, JPEG, WebP, or GIF image.';return}
  if(file.size>500*1024){this.avatarErr='Image is too large (max 500KB).';return}
  const reader=new FileReader();reader.onload=()=>{this.avatarDataUrl=reader.result as string;this.avatarPreview=this.avatarDataUrl};reader.onerror=()=>this.avatarErr='Could not read the image.';reader.readAsDataURL(file);
 }
 async update(){
  this.okMsg=this.errEmail=this.errPhone=this.errZip=this.errPassword='';
  if(this.busy())return;
  const patch:Record<string,string>={};
  if(this.email.trim()){if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(this.email.trim()))this.errEmail='Invalid email format.';else patch['email']=this.email.trim()}
  if(this.phone.trim()){if(!/^\d{10}$/.test(this.phone.trim()))this.errPhone='Phone must be 10 digits.';else patch['phone']=this.phone.trim()}
  if(this.zipcode.trim()){if(!/^\d{5}$/.test(this.zipcode.trim()))this.errZip='Zipcode must be 5 digits.';else patch['zipcode']=this.zipcode.trim()}
  if(this.password && (this.password.length<8||this.password.length>128))this.errPassword='Password must contain 8–128 characters.';
  if(this.errEmail||this.errPhone||this.errZip||this.errPassword||this.avatarErr)return;
  if(this.avatarDataUrl)patch['avatar']=this.avatarDataUrl;
  if(!Object.keys(patch).length&&!this.password){this.okMsg='Nothing to update.';return}
  this.busy.set(true);
  try{
   if(Object.keys(patch).length){
    const profile=await firstValueFrom(this.http.put(`${BASE_URL}/profile`,patch,{withCredentials:true}));
    const user=this.users.toAppUser(profile);this.S.setLoggedIn(user,user.catchPhrase,false);
    this.email=this.phone=this.zipcode='';this.avatarDataUrl=this.avatarPreview=null;
   }
   if(this.password){
    await firstValueFrom(this.http.put(`${BASE_URL}/password`,{password:this.password},{withCredentials:true}));
    this.password='';this.S.logout();void this.router.navigateByUrl('/');
   }else this.okMsg='Profile updated.';
  }catch(e:any){this.okMsg=e?.error?.error||'Update failed. Please retry.'}
  finally{this.busy.set(false)}
 }
}
