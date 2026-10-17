import {signal} from '@angular/core';
import {of} from 'rxjs';
import {ProfileComponent} from './profile';
describe('ProfileComponent persisted edits',()=>{
 let comp:ProfileComponent,http:any,state:any,router:any;
 beforeEach(()=>{state={currentUser:signal({username:'alex'}),setLoggedIn:jasmine.createSpy(),logout:jasmine.createSpy()};router={navigateByUrl:jasmine.createSpy().and.resolveTo(true)};http={put:jasmine.createSpy().and.returnValue(of({username:'alex'}))};comp=new ProfileComponent(state,router,http,{toAppUser:(p:any)=>p} as any)});
 it('validates all fields before any mutation',async()=>{comp.email='new@example.test';comp.phone='bad';await comp.update();expect(http.put).not.toHaveBeenCalled();expect(comp.errPhone).toContain('10 digits')});
 it('sends profile fields in one atomic request',async()=>{comp.email='new@example.test';comp.zipcode='60601';await comp.update();expect(http.put).toHaveBeenCalledOnceWith('/api/profile',{email:'new@example.test',zipcode:'60601'},{withCredentials:true});expect(comp.okMsg).toBe('Profile updated.')});
 it('persists passwords and clears the revoked session',async()=>{comp.password='ChangedPassword2026!';await comp.update();expect(http.put).toHaveBeenCalledOnceWith('/api/password',{password:'ChangedPassword2026!'},{withCredentials:true});expect(state.logout).toHaveBeenCalled();expect(router.navigateByUrl).toHaveBeenCalledWith('/')});
 it('rejects weak passwords',async()=>{comp.password='short';await comp.update();expect(http.put).not.toHaveBeenCalled();expect(comp.errPassword).toContain('8–128')});
});
