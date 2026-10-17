import {signal} from '@angular/core';
import {of,throwError} from 'rxjs';
import {MainComponent} from './main';
describe('MainComponent regressions',()=>{
 let comp:MainComponent,state:any,posts:any,router:any,http:any;
 beforeEach(()=>{state={currentUser:signal({username:'alex'}),following:signal(['maya']),headline:signal('Hello'),logout:jasmine.createSpy()};posts={getAllPosts:jasmine.createSpy().and.returnValue(of(Array.from({length:15},(_,i)=>({id:i+1,body:`Post ${i}`,timestamp:'2026-10-17'})))),addComment:jasmine.createSpy().and.returnValue(of([{id:1,body:'Server result'}])),getCommentsByPost:jasmine.createSpy().and.returnValue(of([]))};router={navigateByUrl:jasmine.createSpy().and.resolveTo(true)};http={put:jasmine.createSpy().and.returnValue(of({}))};comp=new MainComponent(state,posts,router,http)});
 it('retains feed posts beyond the first page',()=>{comp.ngOnInit();expect(comp.articles().length).toBe(10);expect(comp.hasMore).toBeTrue();comp.loadMore();expect(comp.articles().length).toBe(15);expect(comp.hasMore).toBeFalse()});
 it('renders the persisted comment response',()=>{comp.newComments[1]='hello';comp.submitComment(1);expect(comp.commentsMap.get(1)?.[0].body).toBe('Server result')});
 it('revokes the server session before clearing local identity',()=>{comp.logout();expect(http.put).toHaveBeenCalledWith('/api/logout',{}, {withCredentials:true});expect(state.logout).toHaveBeenCalled();expect(router.navigateByUrl).toHaveBeenCalledWith('/')});
 it('keeps local identity if logout fails',()=>{spyOn(window,'alert');http.put.and.returnValue(throwError(()=>({status:500})));comp.logout();expect(state.logout).not.toHaveBeenCalled()});
});
