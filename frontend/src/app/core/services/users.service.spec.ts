import {TestBed} from '@angular/core/testing';
import {provideHttpClient} from '@angular/common/http';
import {provideHttpClientTesting,HttpTestingController} from '@angular/common/http/testing';
import {UsersService} from './users.service';
describe('UsersService backend contract',()=>{
 let service:UsersService,http:HttpTestingController;
 beforeEach(()=>{localStorage.clear();TestBed.configureTestingModule({providers:[provideHttpClient(),provideHttpClientTesting()]});service=TestBed.inject(UsersService);http=TestBed.inject(HttpTestingController)});
 afterEach(()=>http.verify());
 it('loads an authenticated profile and preserves display name',()=>{service.getCurrentUser().subscribe(u=>expect(u.name).toBe('Alex Chen'));const r=http.expectOne('/api/profile');expect(r.request.withCredentials).toBeTrue();r.flush({username:'alex',display:'Alex Chen'})});
 it('revokes logout on the backend',()=>{service.logoutBackend().subscribe();const r=http.expectOne('/api/logout');expect(r.request.method).toBe('PUT');expect(r.request.withCredentials).toBeTrue();r.flush({result:'OK'})});
 it('propagates expired sessions instead of fabricating users',()=>{service.getCurrentUser().subscribe({error:e=>expect(e.status).toBe(401)});http.expectOne('/api/profile').flush({error:'Expired'},{status:401,statusText:'Unauthorized'});expect(service.findUser('alex')).toBeNull()});
});
