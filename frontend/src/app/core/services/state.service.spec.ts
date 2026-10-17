import {TestBed} from '@angular/core/testing';
import {provideHttpClient} from '@angular/common/http';
import {provideHttpClientTesting,HttpTestingController} from '@angular/common/http/testing';
import {StateService} from './state.service';
describe('StateService authenticated state',()=>{
 let service:StateService,http:HttpTestingController;
 beforeEach(()=>{localStorage.clear();TestBed.configureTestingModule({providers:[provideHttpClient(),provideHttpClientTesting()]});service=TestBed.inject(StateService);http=TestBed.inject(HttpTestingController)});
 afterEach(()=>http.verify());
 it('requires successful server login and profile',async()=>{const p=service.login('alex','Password2026!');http.expectOne('/api/login').flush({});await Promise.resolve();http.expectOne('/api/profile').flush({username:'alex',display:'Alex'});await p;http.match('/api/following').forEach(r=>r.flush({following:['maya']}));expect(service.currentUser()?.username).toBe('alex');expect(service.following()).toEqual(['maya'])});
 it('rejects failed login without a local identity',async()=>{const p=service.login('alex','wrong').catch(e=>e);http.expectOne('/api/login').flush({error:'Invalid credentials'},{status:401,statusText:'Unauthorized'});await p;expect(service.currentUser()).toBeNull();expect(service.getAuthError()).toContain('Invalid')});
 it('refreshes username-based follows from the server',()=>{service.followByUsername('maya').subscribe(x=>expect(x).toEqual(['maya']));http.expectOne('/api/following/maya').flush({});http.expectOne('/api/following').flush({following:['maya']})});
 it('clears persisted local identity on logout',()=>{localStorage.setItem('app.currentUser','{}');service.logout();expect(service.currentUser()).toBeNull();expect(service.following()).toEqual([]);expect(localStorage.getItem('app.currentUser')).toBeNull()});
});
