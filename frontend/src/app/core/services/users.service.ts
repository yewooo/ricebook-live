// src/app/core/services/users.service.ts
import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { map, tap } from 'rxjs/operators';
import { BASE_URL } from '../../constants';

export interface AppUser {
  id: number;
  username: string;
  name: string;
  email: string;
  phone: string;
  zipcode: string;
  catchPhrase: string;
  avatarUrl: string;
}

@Injectable({ providedIn: 'root' })
export class UsersService {
  private static readonly LS_USERS = 'app.users';

  // 简单缓存，用于本地查找 / following 等
  private cache: AppUser[] = [];

  constructor(private http: HttpClient) {
    // 启动时从 localStorage 把所有登录过的用户载入进来
    this.loadAllUsers();
  }

  // ====== 本地 user registry（让不同账号互相可见） ======

  private loadAllUsers() {
    try {
      const raw = localStorage.getItem(UsersService.LS_USERS);
      if (!raw) return;
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) {
        this.cache = arr.filter(u => u && u.username);
      }
    } catch {
      this.cache = [];
    }
  }

  private saveAllUsers() {
    try {
      localStorage.setItem(UsersService.LS_USERS, JSON.stringify(this.cache));
    } catch {
      // ignore（最多是配额不够，但这比把 app 弄崩强）
    }
  }

  /** 给本地用户分配一个唯一 id（从 1、2、3… 递增） */
  private nextId(): number {
    const max = this.cache.reduce((m, u) => (u.id && u.id > m ? u.id : m), 0);
    return max + 1;
  }

  /** 登录 / 注册成功后，把这个用户写进 registry（避免造假用户 & 修好 id） */
  addOrUpdateUser(user: AppUser) {
    if (!user || !user.username) return;
    const uname = user.username.toLowerCase();
    const idx = this.cache.findIndex(u => u.username.toLowerCase() === uname);

    if (idx >= 0) {
      // 已存在：保持一个稳定的 id，如果原来或这次都没有，就给一个新的
      const existing = this.cache[idx];
      const id =
        (existing.id && existing.id > 0)
          ? existing.id
          : (user.id && user.id > 0)
            ? user.id
            : this.nextId();

      const merged: AppUser = {
        ...existing,
        ...user,
        id,
      };
      this.cache[idx] = merged;
    } else {
      // 新用户：如果后端没给 id，就用 nextId()
      const id = (user.id && user.id > 0) ? user.id : this.nextId();
      const normalized: AppUser = { ...user, id };
      this.cache.push(normalized);
    }

    this.saveAllUsers();
  }

  /** 在缓存里更新某个用户并写回 localStorage（给 headline/avatar 更新用） */
  updateCachedUser(username: string, patch: Partial<AppUser>) {
    const uname = username.trim().toLowerCase();
    const idx = this.cache.findIndex(u => u.username.toLowerCase() === uname);
    if (idx === -1) return;

    const existing = this.cache[idx];
    const merged: AppUser = { ...existing, ...patch };
    this.cache[idx] = merged;
    this.saveAllUsers();
  }

  // ====== 认证相关 ======

  loginBackend(username: string, password: string): Observable<any> {
    return this.http.post(
      `${BASE_URL}/login`,
      { username, password },
      { withCredentials: true }
    );
  }

  logoutBackend(): Observable<any> {
    return this.http.put(
      `${BASE_URL}/logout`,
      {},
      { withCredentials: true }
    );
  }

  registerBackend(payload: {
    username: string;
    password: string;
    email: string;
    dob: string;
    phone: string;
    zipcode: string;
  }): Observable<any> {
    return this.http.post(
      `${BASE_URL}/register`,
      payload,
      { withCredentials: true }
    );
  }

  /** 从后端获取当前登录用户 profile（/profile），并更新缓存 + localStorage */
  getCurrentUser(): Observable<AppUser> {
    return this.http
      .get<any>(`${BASE_URL}/profile`, { withCredentials: true })
      .pipe(
        map((p: any) => this.toAppUser(p)),
        tap(user => this.addOrUpdateUser(user))
      );
  }

  getUsers(): Observable<AppUser[]> {
    if (this.cache.length) {
      return of(this.cache);
    }
    return this.getCurrentUser().pipe(
      map(user => {
        this.addOrUpdateUser(user);
        return this.cache;
      })
    );
  }

  /** ❗只在 registry 里找，不再造假用户 */
  findUser(username: string): AppUser | null {
    const uname = username.trim().toLowerCase();
    const u = this.cache.find(x => x.username.toLowerCase() === uname);
    return u || null;
  }

  findUserById(id: number): AppUser | null {
    return this.cache.find(u => u.id === id) || null;
  }

  isValidPassword(user: AppUser, password: string): boolean {
    return !!password && password.trim().length > 0;
  }

  toAppUser(p: any): AppUser {
    if (p && typeof p === 'object' && 'avatarUrl' in p && 'catchPhrase' in p) {
      return p as AppUser;
    }

    return {
      id: p.id ?? 0,
      username: p.username ?? '',
      name: p.name ?? p.display ?? p.username ?? '',
      email: p.email ?? '',
      phone: p.phone ?? '',
      zipcode: p.zipcode ?? '',
      catchPhrase: p.headline ?? '',
      avatarUrl: p.avatar ?? ''
    };
  }

  defaultFollowingFor(currentUserId: number): number[] {
    return this.cache
      .filter(u => u.id !== currentUserId)
      .map(u => u.id)
      .slice(0, 3);
  }

  /** 更新 headline：调用后端 + 同步 registry */
  updateHeadline(headline: string): Observable<any> {
    return this.http
      .put(
        `${BASE_URL}/headline`,
        { headline },
        { withCredentials: true }
      )
      .pipe(
        tap((res: any) => {
          const username = res?.username;
          const newHeadline = res?.headline ?? headline;
          if (username) {
            this.updateCachedUser(username, { catchPhrase: newHeadline });
          }
        })
      );
  }

  /** 更新头像（如果以后用 JSON avatar） */
  updateAvatar(avatarUrl: string): Observable<any> {
    return this.http
      .put(
        `${BASE_URL}/avatar`,
        { avatar: avatarUrl },
        { withCredentials: true }
      )
      .pipe(
        tap((res: any) => {
          const username = res?.username;
          const newAvatar = res?.avatar ?? avatarUrl;
          if (username) {
            this.updateCachedUser(username, { avatarUrl: newAvatar });
          }
        })
      );
  }
}
