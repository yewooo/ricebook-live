// src/app/core/services/posts.service.ts
import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { map, tap } from 'rxjs/operators';
import { Observable, of } from 'rxjs';
import { BASE_URL } from '../../constants';

export interface Post {
  userId: number;
  id: number;
  title: string;
  body: string;
  image?: string;
  timestamp?: string;
  authorName?: string;
}

// ✅ 继续沿用你原来的字段结构，方便 main.html 直接用
export interface Comment {
  postId: number;
  id: number;      // 对应后端 commentId
  name: string;    // 对应后端 author
  email: string;   // 没有真实 email，就先用占位
  body: string;    // 对应后端 text
}

@Injectable({ providedIn: 'root' })
export class PostsService {
  private cache: Post[] = [];

  constructor(private http: HttpClient) {}

  // ===== 从后端获取所有可见文章（通常是自己 + following） =====
  getAllPosts(): Observable<Post[]> {
    return this.http
      .get<any>(`${BASE_URL}/articles`, { withCredentials: true })
      .pipe(
        map((res: any) => {
          const articles = Array.isArray(res.articles) ? res.articles : res;
          const posts = (articles || []).map((a: any) => this.toPost(a));
          return posts;
        }),
        tap(list => (this.cache = list))
      );
  }

  // ===== 将来如果需要按作者列表额外过滤，可以继续在这里扩展 =====
  getFeedByAuthors(_authors: string[]): Observable<Post[]> {
    // 后端已经基于登录用户过滤了 /articles；
    // 前端再按 author 过滤容易把东西都过滤光，所以这里先直接复用 getAllPosts。
    return this.getAllPosts();
  }

  // ===== 按 userId 获取文章（给其他地方/测试用） =====
  getPostsByUser(userId: number): Observable<Post[]> {
    const pick = (posts: Post[]) =>
      posts
        .filter(p => p.userId === userId)
        .slice(0, 10)
        .reverse();

    if (this.cache.length) {
      return of(pick(this.cache));
    }
    return this.getAllPosts().pipe(map(pick));
  }

  // ===== 真·从后端获取某篇文章的评论 =====
  getCommentsByPost(postId: number): Observable<Comment[]> {
    return this.http
      .get<any>(`${BASE_URL}/articles/${postId}`, {
        withCredentials: true,
      })
      .pipe(
        map((res: any) => {
          const articles = Array.isArray(res.articles)
            ? res.articles
            : [res.article ?? res];

          const a = articles[0] || {};
          const rawComments: any[] = Array.isArray(a.comments)
            ? a.comments
            : [];

          return rawComments.map(c => this.toComment(c, a.pid ?? postId));
        })
      );
  }

  // ===== 创建文章：支持纯文字 + 可选图片文件（后端目前只用 text） =====
  createPost(text: string, imageFile?: File): Observable<Post> {
    const hasImage = !!imageFile;

    let body: any;
    const options = { withCredentials: true };

    if (hasImage) {
      // 将来后端如果支持 multipart/form-data，就用这个分支
      const form = new FormData();
      form.append('text', text);
      form.append('image', imageFile!); // 字段名 "image" 或 "img" 要和后端对应
      body = form;
    } else {
      // 现在的后端是 JSON: { text }
      body = { text };
    }

    return this.http
      .post<any>(`${BASE_URL}/article`, body, options)
      .pipe(
        map(res => {
          const articles = Array.isArray(res.articles)
            ? res.articles
            : [res.article ?? res];
          const a = articles[0];
          const p = this.toPost(a);
          this.cache.unshift(p);
          return p;
        })
      );
  }

  // ===== 编辑文章正文 =====
  updatePost(id: number, text: string): Observable<Post> {
    return this.http
      .put<any>(
        `${BASE_URL}/articles/${id}`,
        { text },
        { withCredentials: true }
      )
      .pipe(
        map(res => {
          const articles = Array.isArray(res.articles)
            ? res.articles
            : [res.article ?? res];
          const a = articles[0];
          const updated = this.toPost(a);
          this.cache = this.cache.map(p => (p.id === updated.id ? updated : p));
          return updated;
        })
      );
  }

  // ===== 删除文章（作者本人） =====
  deletePost(id: number): Observable<void> {
    return this.http
      .delete<void>(`${BASE_URL}/articles/${id}`, {
        withCredentials: true,
      })
      .pipe(
        tap(() => {
          this.cache = this.cache.filter(p => p.id !== id);
        })
      );
  }

  // ===== 新增评论：调用后端 PUT /articles/:id + commentId:-1，返回最新评论列表 =====
  addComment(postId: number, text: string): Observable<Comment[]> {
    return this.http
      .put<any>(
        `${BASE_URL}/articles/${postId}`,
        { text, commentId: -1 },
        { withCredentials: true }
      )
      .pipe(
        map((res: any) => {
          const articles = Array.isArray(res.articles)
            ? res.articles
            : [res.article ?? res];
          const a = articles[0] || {};
          const rawComments: any[] = Array.isArray(a.comments)
            ? a.comments
            : [];
          return rawComments.map(c => this.toComment(c, a.pid ?? postId));
        })
      );
  }

  // （可选）编辑某条已有评论：commentId >= 0
  updateComment(postId: number, commentId: number, text: string): Observable<Comment[]> {
    return this.http
      .put<any>(
        `${BASE_URL}/articles/${postId}`,
        { text, commentId },
        { withCredentials: true }
      )
      .pipe(
        map((res: any) => {
          const articles = Array.isArray(res.articles)
            ? res.articles
            : [res.article ?? res];
          const a = articles[0] || {};
          const rawComments: any[] = Array.isArray(a.comments)
            ? a.comments
            : [];
          return rawComments.map(c => this.toComment(c, a.pid ?? postId));
        })
      );
  }

  // ===== 工具 / 测试 =====
  __seedForTests(posts: Post[]) {
    this.cache = posts;
  }

  fetchAll(): Post[] {
    return this.cache;
  }

  fetchByUserIds(ids: number[]): Post[] {
    return this.cache
      .filter(p => ids.includes(p.userId))
      .sort((a, b) => b.id - a.id);
  }

  filter(posts: Post[], keyword: string): Post[] {
    const lower = (keyword || '').toLowerCase();
    return posts.filter(
      p =>
        (p.body || '').toLowerCase().includes(lower) ||
        (p.authorName || '').toLowerCase().includes(lower)
    );
  }

  addLocalPost(userId: number, text: string): Post {
    const newPost: Post = {
      userId,
      id: Date.now(),
      title: 'Local Post',
      body: text,
      timestamp: new Date().toISOString().split('T')[0],
      image: undefined,
      authorName: `User${userId}`,
    };
    this.cache.unshift(newPost);
    return newPost;
  }

  // ===== 映射：后端 article → 前端 Post =====
  private toPost(a: any): Post {
    const id = a.pid ?? a._id ?? a.id ?? Date.now();
    const text = a.text ?? a.body ?? '';
    const author = a.author ?? a.username ?? a.authorName ?? 'unknown';
    const img = a.img ?? a.image ?? undefined;
    const dateStr = a.date ?? a.timestamp ?? new Date().toISOString();

    return {
      userId: a.userId ?? 0,
      id,
      title: (text || '').slice(0, 40),
      body: text,
      image: img,
      timestamp:
        typeof dateStr === 'string'
          ? dateStr.split('T')[0]
          : new Date(dateStr).toISOString().split('T')[0],
      authorName: author,
    };
  }

  // ===== 映射：后端 comment → 前端 Comment（兼容你现在的模板） =====
  private toComment(c: any, postId: number): Comment {
    const id = c.commentId ?? c.id ?? 0;
    const author = c.author ?? 'unknown';
    const text = c.text ?? c.body ?? '';

    return {
      postId,
      id,
      name: author,
      email: '', // Email is private.
      body: text,
    };
  }
}
