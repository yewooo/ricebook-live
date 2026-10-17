import {TestBed} from '@angular/core/testing';
import {provideHttpClient} from '@angular/common/http';
import {provideHttpClientTesting,HttpTestingController} from '@angular/common/http/testing';
import {PostsService} from './posts.service';
describe('PostsService persistence contract',()=>{
 let service:PostsService,http:HttpTestingController;
 beforeEach(()=>{TestBed.configureTestingModule({providers:[provideHttpClient(),provideHttpClientTesting()]});service=TestBed.inject(PostsService);http=TestBed.inject(HttpTestingController)});
 afterEach(()=>http.verify());
 it('maps MongoDB articles without inventing images',()=>{service.getAllPosts().subscribe(p=>{expect(p[0].id).toBe(42);expect(p[0].body).toBe('Hello');expect(p[0].image).toBeUndefined()});http.expectOne('/api/articles').flush({articles:[{pid:42,author:'alex',text:'Hello'}]})});
 it('loads comments without inventing private emails',()=>{service.getCommentsByPost(42).subscribe(c=>{expect(c[0].body).toBe('Saved');expect(c[0].email).toBe('')});http.expectOne('/api/articles/42').flush({articles:[{pid:42,comments:[{commentId:0,author:'maya',text:'Saved'}]}]})});
 it('uses server-assigned comment IDs',()=>{service.addComment(42,'Hello').subscribe(c=>expect(c[0].id).toBe(9));const r=http.expectOne('/api/articles/42');expect(r.request.body).toEqual({text:'Hello',commentId:-1});r.flush({articles:[{pid:42,comments:[{commentId:9,author:'alex',text:'Hello'}]}]})});
 it('does not cache rejected posts',()=>{service.createPost('Rejected').subscribe({error:()=>{}});http.expectOne('/api/article').flush({error:'Failed'},{status:500,statusText:'Error'});expect(service.fetchAll()).toEqual([])});
});
