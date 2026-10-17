// src/app/auth/auth.ts
import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, NgForm } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { HttpClient } from '@angular/common/http';

import { StateService, AppUser } from '../core/services/state.service';
import { UsersService } from '../core/services/users.service';
import { firstValueFrom } from 'rxjs';
import { BASE_URL } from '../constants';

@Component({
  selector: 'app-auth',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './auth.html',
  styleUrls: ['./auth.css'],
})
export class AuthComponent implements OnInit {
  registering = false;
  googleEnabled = false;
  busy = false;
  googleUrl = `${BASE_URL}/auth/google`;
  constructor(
    private router: Router,
    private S: StateService,
    private http: HttpClient,
    private users: UsersService,
    private route: ActivatedRoute,
  ) {}

  async ngOnInit() {
    try { this.googleEnabled = (await firstValueFrom(this.http.get<{googleEnabled:boolean}>(`${BASE_URL}/auth/config`))).googleEnabled; } catch {}
    const oauth = this.route.snapshot.queryParamMap.get('oauth');
    if(oauth === 'error') this.loginErr = 'Google sign-in was cancelled or failed. Please try again.';
    if(oauth === 'complete') {
      try { const user=await firstValueFrom(this.users.getCurrentUser());this.S.setLoggedIn(user,user.catchPhrase,false);void this.router.navigateByUrl('/main'); }
      catch { this.loginErr='Google sign-in did not create a valid session. Please retry.'; }
    }
  }

  // 登录
  login = { username: '', password: '' };
  loginErr = '';

  // 注册模型
  reg = {
    accountName: '',
    displayName: '',
    email: '',
    phone: '',
    dob: '',
    zipcode: '',
    password: '',
    confirmPassword: ''
  };
  timestamp = Date.now();
  okMsg = '';
  pwErr = '';
  dobErr = '';

  async loginLater() {
    if(this.busy)return;
    this.loginErr='';this.busy=true;
    try { await this.S.login(this.login.username.trim(),this.login.password);void this.router.navigateByUrl('/main'); }
    catch(e:any){this.loginErr=e.message||'Login failed';}
    finally{this.busy=false;}
  }

  // ===== 注册：调用后端 /register，然后自动登录 =====
  handleRegister(f: NgForm) {
    this.okMsg = this.pwErr = this.dobErr = '';
    if (f.invalid || this.busy) return;

    if (this.reg.password !== this.reg.confirmPassword) {
      this.pwErr = 'Passwords do not match!';
      return;
    }

    const dob = new Date(this.reg.dob);
    const today = new Date();
    let age = today.getFullYear() - dob.getFullYear();
    const m = today.getMonth() - dob.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) age--;
    if (!(Number.isFinite(age)) || age < 18) {
      this.dobErr = 'You must be at least 18 years old to register.';
      return;
    }

    const username = this.reg.accountName.trim();
    const payload = {
      username,
      password: this.reg.password,
      email: this.reg.email,
      dob: this.reg.dob,
      phone: this.reg.phone,
      zipcode: this.reg.zipcode,
    };

    this.okMsg = 'Registering...';

    this.busy=true;
    this.http.post(`${BASE_URL}/register`,{...payload,display:this.reg.displayName||username},{withCredentials:true}).subscribe({
      next: () => this.users.getCurrentUser().subscribe({
        next: user => {this.S.setLoggedIn(user,user.catchPhrase,true);this.busy=false;void this.router.navigateByUrl('/main');},
        error: () => {this.busy=false;this.okMsg='Account created. Please log in to continue.';}
      }),
      error: e => {this.busy=false;this.okMsg=e?.error?.error||'Registration failed.';}
    });
  }

  resetForm(f: NgForm) {
    f.resetForm();
    this.okMsg = '';
    this.pwErr = '';
    this.dobErr = '';
  }
}
