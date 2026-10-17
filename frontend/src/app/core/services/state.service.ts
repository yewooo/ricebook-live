// src/app/core/services/state.service.ts
import { Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { map, switchMap, tap } from 'rxjs/operators';

import { UsersService, AppUser as UsersAppUser } from './users.service';
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

// 这里只存「当前登录的用户对象」本身
const LS_CURRENT_USER = 'app.currentUser';
const LS_HEADLINE     = 'app.headline';

@Injectable({ providedIn: 'root' })
export class StateService {
  currentUser  = signal<AppUser | null>(null);
  headline     = signal<string>('');
  // ✅ 现在 following 只存用户名数组，由后端控制
  following    = signal<string[]>([]);
  feed         = signal<any[]>([]);
  newPostDraft = signal<string>('');
  isNewUser    = signal<boolean>(false);

  private authError = signal<string | null>(null);

  constructor(
    private users: UsersService,
    private http: HttpClient,
  ) {
    // 只做本地恢复 currentUser/headline，然后如果 cookie 还在，再向后端要 following
    this.restoreFromStorage();
  }

  // ========== 持久化/恢复 ==========
  private keyHeadline(username: string) {
    return `${LS_HEADLINE}:${username}`;
  }

  restoreFromStorage(): void {
    const raw = localStorage.getItem(LS_CURRENT_USER);
    if (!raw) {
      this.currentUser.set(null);
      this.headline.set('');
      this.following.set([]);
      return;
    }

    try {
      const u = JSON.parse(raw) as AppUser;
      this.currentUser.set(u);
      this.users.addOrUpdateUser(u as UsersAppUser);

      const hl = localStorage.getItem(this.keyHeadline(u.username));
      if (hl !== null) {
        this.headline.set(hl);
      } else {
        this.headline.set(u.catchPhrase ?? '');
      }

    } catch {
      this.currentUser.set(null);
      this.headline.set('');
      this.following.set([]);
    }
  }

  // ========== 小工具：从后端拉 /following 并更新 signal ==========
  private refreshFollowingFromServer() {
    return this.http
      .get<any>(`${BASE_URL}/following`, { withCredentials: true })
      .pipe(
        map(res => (res?.following as string[]) || []),
        tap(list => this.following.set(list))
      );
  }

  // ========== Auth ==========
  isLoggedIn(): boolean { return this.currentUser() !== null; }
  getAuthError(): string | null { return this.authError(); }

  async login(username: string, password: string): Promise<void> {
    this.authError.set(null);
    const creds = { username, password };

    try {
      // 1) 先登录，建立 session
      await firstValueFrom(
        this.http.post(`${BASE_URL}/login`, creds, {
          withCredentials: true,
        })
      );

      // 2) 拉当前用户 profile
      const appUser = await firstValueFrom(
        this.users.getCurrentUser()
      );

      this.setLoggedIn(appUser as UsersAppUser, appUser.catchPhrase, false);

      // 3) 登录后预加载 user list（可选）
      this.users.getUsers().subscribe({
        next: (list) =>
          console.log('[Users preloaded after login]', list.length),
        error: () =>
          console.warn('[Users preload failed after login]')
      });

    } catch (err: any) {
      const msg =
        err?.error?.result ||
        err?.error?.error ||
        err?.error?.message ||
        err?.message ||
        'Login failed';
      this.authError.set(msg);
      this.currentUser.set(null);
      throw new Error(msg);
    }
  }

  logout(): void {
    this.currentUser.set(null);
    this.headline.set('');
    this.following.set([]);
    this.feed.set([]);
    this.newPostDraft.set('');
    this.isNewUser.set(false);
    this.authError.set(null);
    localStorage.removeItem(LS_CURRENT_USER);
    // headline 仍然是 per-user 缓存，保留没问题
  }

  // ========== Headline ==========
  updateHeadline(text: string): void {
    const u = this.currentUser();
    if (!u) return;

    const newHeadline = text.trim();
    if (!newHeadline) return;

    // 本地立即更新
    this.headline.set(newHeadline);
    try {
      localStorage.setItem(this.keyHeadline(u.username), newHeadline);
    } catch (e) {
      console.warn('write headline failed', e);
    }

    // 后端持久化
    this.users.updateHeadline(newHeadline).subscribe({
      next: (res) => {
        const cur = this.currentUser();
        if (!cur) return;
        const finalHeadline = res?.headline ?? newHeadline;
        const updated: AppUser = { ...cur, catchPhrase: finalHeadline };
        this.currentUser.set(updated);

        try {
          localStorage.setItem(LS_CURRENT_USER, JSON.stringify(updated));
          localStorage.setItem(this.keyHeadline(updated.username), finalHeadline);
        } catch (e) {
          console.warn('write updated currentUser/headline failed', e);
        }

        this.users.addOrUpdateUser(updated as UsersAppUser);
      },
      error: (err) => {
        console.error('update headline failed', err);
      }
    });
  }
  setHeadline(h: string) { this.updateHeadline(h); }

  // ========== Follow / Unfollow（全部走后端） ==========
  /**
   * 关注某个用户名：
   *  - 调 PUT /following/:user
   *  - 成功后刷新一次 /following → this.following
   *  返回 Observable<string[]>，组件里 subscribe 再 reloadFeed。
   */
  followByUsername(username: string) {
    const name = username.trim();
    if (!name) {
      // 返回一个“什么都不做”的 Observable，用来链式调用
      return this.refreshFollowingFromServer();
    }

    return this.http
      .put(
        `${BASE_URL}/following/${encodeURIComponent(name)}`,
        {},
        { withCredentials: true }
      )
      .pipe(
        switchMap(() => this.refreshFollowingFromServer())
      );
  }

  /**
   * 根据用户名取关：
   *  - 调 DELETE /following/:user
   *  - 成功后刷新一次 /following
   */
  unfollowByUsername(username: string) {
    const name = username.trim();
    if (!name) {
      return this.refreshFollowingFromServer();
    }

    return this.http
      .delete(
        `${BASE_URL}/following/${encodeURIComponent(name)}`,
        { withCredentials: true }
      )
      .pipe(
        switchMap(() => this.refreshFollowingFromServer())
      );
  }

  // ========== 统一入口：注册/其它路径设置登录态 ==========
  setLoggedIn(user: AppUser, headline: string, isNew: boolean) {
    this.currentUser.set(user);
    this.isNewUser.set(isNew);

    const effectiveHeadline = headline ?? user.catchPhrase ?? '';
    this.headline.set(effectiveHeadline);

    try {
      localStorage.setItem(LS_CURRENT_USER, JSON.stringify(user));
      localStorage.setItem(this.keyHeadline(user.username), effectiveHeadline);
    } catch (e) {
      console.warn('write currentUser/headline failed', e);
    }

    this.users.addOrUpdateUser(user as UsersAppUser);

    // ✅ following 完全以后端为准：登录/注册之后立刻拉一次
    this.refreshFollowingFromServer().subscribe({
      error: (err) => {
        console.warn('setLoggedIn: refreshFollowingFromServer failed', err);
      }
    });
  }
}
