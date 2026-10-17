// src/app/main/main.ts
import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink, Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { BASE_URL } from '../constants';
import { StateService } from '../core/services/state.service';
import { PostsService, Post, Comment } from '../core/services/posts.service';

@Component({
  selector: 'app-main',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './main.html',
  styleUrls: ['./main.css'],
})
export class MainComponent implements OnInit {
  constructor(
    public S: StateService,
    private posts: PostsService,
    private router: Router,
    private http: HttpClient
  ) {}

  // 所有文章（当前 feed：后端给什么我们就吃什么）
  private allPosts: Post[] = [];

  // 当前页面展示的文章
  articles = signal<Post[]>([]);
  searchText = '';

  // 发表新帖输入
  newPostText = '';
  newImage?: File;

  // 分页
  page = 0;
  pageSize = 10;
  hasMore = false;

  // 评论展开/缓存
  commentsMap = new Map<number, Comment[]>();
  expanded = new Set<number>();

  // 每个 post 的“正在输入的评论内容”
  newComments: { [postId: number]: string } = {};

  // 搜索过滤
  filtered(): Post[] {
    const term = this.searchText.trim().toLowerCase();
    const list = this.articles();
    if (!term) return list;
    return list.filter(
      (a) =>
        (a.body ?? '').toLowerCase().includes(term) ||
        (a.authorName ?? '').toLowerCase().includes(term)
    );
  }

  // headline 直接走 StateService
  get headlineText() {
    return this.S.headline();
  }
  set headlineText(v: string) {
    this.S.setHeadline(v);
  }

  ngOnInit() {
    const user = this.S.currentUser();
    if (!user) {
      this.router.navigateByUrl('/');
      return;
    }

    this.reloadFeed();
    this.searchText = '';
  }

  // ===== 从后端 /articles 拉所有可见文章，取最近 10 条 =====
  private reloadFeed() {
    this.posts.getAllPosts().subscribe({
      next: (list) => {
        const sorted = [...list].sort((a, b) => {
          const ta =
            (a.timestamp ? new Date(a.timestamp).getTime() : a.id) || 0;
          const tb =
            (b.timestamp ? new Date(b.timestamp).getTime() : b.id) || 0;
          return tb - ta;
        });

        const top10 = sorted;

        const processed = top10;

        this.allPosts = processed;
        this.applyPage(0);
      },
      error: (err) => {
        console.error('load feed failed', err);
        this.allPosts = [];
        this.applyPage(0);
      },
    });
  }

  // ===== 分页逻辑 =====
  private applyPage(page: number) {
    const start = page * this.pageSize;
    const slice = this.allPosts.slice(start, start + this.pageSize);
    this.articles.set(slice);
    this.page = page;
    this.hasMore = this.allPosts.length > start + this.pageSize;
  }

  loadMore() {
    if (!this.hasMore) return;
    const nextPage = this.page + 1;
    const start = nextPage * this.pageSize;
    const slice = this.allPosts.slice(start, start + this.pageSize);
    this.articles.set([...this.articles(), ...slice]);
    this.page = nextPage;
    this.hasMore = this.allPosts.length > start + this.pageSize;
  }

  // ===== 发帖 =====
  onImageSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      this.newImage = input.files[0];
    } else {
      this.newImage = undefined;
    }
  }

  addPost() {
    const text = this.newPostText.trim();
    if (!text) return;
    const user = this.S.currentUser();
    if (!user) return;

    this.posts.createPost(text, this.newImage).subscribe({
      next: () => {
        this.newPostText = '';
        this.newImage = undefined;
        this.reloadFeed();
      },
      error: (err) => {
        console.error('createPost failed', err);
        alert('Failed to create post');
      },
    });
  }

  clearPost() {
    this.newPostText = '';
    this.newImage = undefined;
  }

  // ===== 评论展开/收起 =====
  toggleComments(postId: number) {
    if (this.expanded.has(postId)) {
      this.expanded.delete(postId);
      return;
    }
    this.expanded.add(postId);

    // 如果已经有缓存就不用再拉
    if (this.commentsMap.has(postId)) return;

    // 现在后端还没真正的评论接口，这里先拉一个空数组
    this.posts.getCommentsByPost(postId).subscribe((list) => {
      this.commentsMap.set(postId, (list ?? []).slice(0, 50));
    });
  }

  // ===== 提交一条评论（前端先本地插入，顺便通知 service） =====
  submitComment(postId: number) {
    const raw = this.newComments[postId] ?? '';
    const text = raw.trim();
    if (!text) return;

    this.posts.addComment(postId, text).subscribe({
      next: (list) => {
        this.commentsMap.set(postId, list);
        this.newComments[postId] = '';
      },
      error: () => alert('Comment was not saved. Please try again.'),
    });
  }

  // ===== 关注 / 取关 =====

  // 取关：现在根据用户名调用 StateService.unfollowByUsername
  unfollow(index: number) {
    const list = this.S.following();
    const username = list[index];
    if (!username) return;

    this.S.unfollowByUsername(username).subscribe({
      next: () => this.reloadFeed(),
      error: (err) => {
        console.error('unfollow failed', err);
        alert('Unfollow failed');
      },
    });
  }

  // 添加关注：调用 StateService.followByUsername，并在完成后 reloadFeed
  addFollower(username: string) {
    const name = username.trim();
    if (!name) return;

    this.S.followByUsername(name).subscribe({
      next: () => this.reloadFeed(),
      error: (err) => {
        console.error('follow failed', err);
        alert('Failed to follow user');
      },
    });
  }

  logout() {
    this.http.put(`${BASE_URL}/logout`, {}, {withCredentials:true}).subscribe({
      next: () => { this.S.logout(); void this.router.navigateByUrl('/'); },
      error: (e) => {
        if(e.status === 401) { this.S.logout(); void this.router.navigateByUrl('/'); }
        else alert('Logout failed. Please try again.');
      }
    });
  }
}
