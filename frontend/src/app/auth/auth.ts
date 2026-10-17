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
  template: `
    <div class="container d-flex justify-content-center">
      <div
        class="card shadow-sm mt-5 p-4"
        style="min-width:360px;max-width:520px;width:100%;border-radius:1rem;"
      >
        <h2 class="mb-3">RiceBook Live</h2>

        <!-- 登录 -->
        <div class="mb-4">
          <h5 class="mb-2">Log in</h5><p class="text-muted small">Your feed, your people, and realtime conversations.</p>
          <div class="row g-2">
            <div class="col-12">
              <input
                class="form-control"
                placeholder="Account name (username)"
                [(ngModel)]="login.username"
                name="loginUsername"
              >
            </div>
            <div class="col-12">
              <input
                type="password"
                class="form-control"
                placeholder="Password"
                [(ngModel)]="login.password"
                name="loginPassword"
              >
            </div>
            <div class="col-12 d-flex gap-2">
              <button
                class="btn btn-dark w-100"
                type="button"
                (click)="loginLater()" [disabled]="busy"
              >
                Log in
              </button>
            </div>
            <div class="text-danger small mt-2" *ngIf="loginErr">
              {{ loginErr }}
            </div>
          </div>
        </div>

        <a *ngIf="googleEnabled" [href]="googleUrl" class="btn btn-outline-dark w-100">Continue with Google</a>
        <hr class="my-4"/>

        <!-- 注册 -->
        <h5 class="mb-2">Register</h5>
        <form
          #f="ngForm"
          (ngSubmit)="handleRegister(f)"
          novalidate
          class="row g-3"
        >
          <div class="col-12">
            <label class="form-label">Account Name *</label>
            <input
              class="form-control"
              name="accountName"
              [(ngModel)]="reg.accountName"
              pattern="^[A-Za-z][A-Za-z0-9]*$"
              required
              title="Account name must start with a letter and contain only letters or numbers."
            >
            <div
              class="invalid-feedback d-block"
              *ngIf="f.submitted && f.controls['accountName']?.invalid"
            >
              Must start with a letter and contain only letters or numbers.
            </div>
          </div>

          <div class="col-12">
            <label class="form-label">Display Name (Optional)</label>
            <input
              class="form-control"
              name="displayName"
              [(ngModel)]="reg.displayName"
            >
          </div>

          <div class="col-12">
            <label class="form-label">Email *</label>
            <input
              type="email"
              class="form-control"
              name="email"
              [(ngModel)]="reg.email"
              required
            >
            <div
              class="invalid-feedback d-block"
              *ngIf="f.submitted && f.controls['email']?.invalid"
            >
              Please enter a valid email.
            </div>
          </div>

          <div class="col-12">
            <label class="form-label">Phone *</label>
            <input
              class="form-control"
              name="phone"
              [(ngModel)]="reg.phone"
              pattern="^\\d{10}$"
              required
              title="Please enter a valid 10-digit phone number."
            >
            <div
              class="invalid-feedback d-block"
              *ngIf="f.submitted && f.controls['phone']?.invalid"
            >
              10 digits only (e.g., 7135551234).
            </div>
          </div>

          <div class="col-12">
            <label class="form-label">Date of Birth *</label>
            <input
              type="date"
              class="form-control"
              name="dob"
              [(ngModel)]="reg.dob"
              required
            >
            <div class="invalid-feedback d-block" *ngIf="f.submitted && dobErr">
              {{ dobErr }}
            </div>
          </div>

          <div class="col-12">
            <label class="form-label">Zip Code *</label>
            <input
              class="form-control"
              name="zipcode"
              [(ngModel)]="reg.zipcode"
              pattern="^\\d{5}$"
              required
              title="Zipcode must be 5 digits."
            >
            <div
              class="invalid-feedback d-block"
              *ngIf="f.submitted && f.controls['zipcode']?.invalid"
            >
              Zipcode must be 5 digits.
            </div>
          </div>

          <div class="col-12">
            <label class="form-label">Password *</label>
            <input
              type="password"
              class="form-control"
              name="password"
              [(ngModel)]="reg.password"
              required
            >
          </div>

          <div class="col-12">
            <label class="form-label">Confirm Password *</label>
            <input
              type="password"
              class="form-control"
              name="confirmPassword"
              [(ngModel)]="reg.confirmPassword"
              required
            >
            <div class="invalid-feedback d-block" *ngIf="f.submitted && pwErr">
              {{ pwErr }}
            </div>
          </div>

          <input type="hidden" name="timestamp" [ngModel]="timestamp">

          <div class="col-12 d-flex gap-2">
            <button
              type="reset"
              class="btn btn-outline-secondary"
              (click)="resetForm(f)"
            >
              Clear
            </button>
            <button type="submit" class="btn btn-primary" [disabled]="busy">
              Submit
            </button>
          </div>

          <div class="text-success small mt-2" *ngIf="okMsg">
            {{ okMsg }}
          </div>
        </form>
      </div>
    </div>
  `,
})
export class AuthComponent implements OnInit {
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
