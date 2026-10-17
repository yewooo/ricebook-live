import {of,throwError} from 'rxjs';
import {AuthComponent} from './auth';
describe('AuthComponent real account flow',()=>{
 let comp:AuthComponent,state:any,http:any,users:any,router:any;
 beforeEach(()=>{state={login:jasmine.createSpy().and.resolveTo(),setLoggedIn:jasmine.createSpy()};http={get:jasmine.createSpy().and.returnValue(of({googleEnabled:true})),post:jasmine.createSpy().and.returnValue(of({}))};users={getCurrentUser:jasmine.createSpy().and.returnValue(of({username:'alex'}))};router={navigateByUrl:jasmine.createSpy().and.resolveTo(true)};comp=new AuthComponent(router,state,http,users,{snapshot:{queryParamMap:{get:()=>null}}} as any)});
 it('enables Google login only from server configuration',async()=>{await comp.ngOnInit();expect(comp.googleEnabled).toBeTrue();expect(comp.googleUrl).toBe('/api/auth/google')});
 it('does not navigate on failed authentication',async()=>{state.login.and.rejectWith(new Error('Invalid credentials'));await comp.loginLater();expect(router.navigateByUrl).not.toHaveBeenCalled();expect(comp.loginErr).toBe('Invalid credentials')});
 it('checks password confirmation before registration',()=>{comp.reg.password='Password2026!';comp.reg.confirmPassword='different';comp.handleRegister({invalid:false} as any);expect(http.post).not.toHaveBeenCalled();expect(comp.pwErr).toContain('match')});
 it('checks age before registration',()=>{comp.reg.password=comp.reg.confirmPassword='Password2026!';comp.reg.dob='2020-01-01';comp.handleRegister({invalid:false} as any);expect(http.post).not.toHaveBeenCalled();expect(comp.dobErr).toContain('18')});
 it('does not fabricate a session if profile recovery fails',()=>{comp.reg={accountName:'alex',displayName:'Alex',email:'a@example.test',phone:'7135551234',dob:'2000-01-01',zipcode:'77005',password:'Password2026!',confirmPassword:'Password2026!'};users.getCurrentUser.and.returnValue(throwError(()=>new Error('offline')));comp.handleRegister({invalid:false} as any);expect(state.setLoggedIn).not.toHaveBeenCalled();expect(comp.okMsg).toContain('Please log in')});
});
