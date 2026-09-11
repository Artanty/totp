import { Component, CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { AuthService } from './auth/auth.service';
import { AdminService } from './admin/admin.service';
import { LoginComponent } from './auth/login/login.component';
import { AdminComponent } from './admin/admin.component';
import { TotpGuardService } from './guard/totp-guard.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [LoginComponent, AdminComponent],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  template: `
    @if (!guardEnabled || guard.unlocked()) {
      @if (!auth.isLoggedIn) {
        <app-login></app-login>
      }
      @if (auth.isLoggedIn) {
        <app-admin></app-admin>
      }
    } @else if (!guard.ready()) {
      <div class="guard-screen">
        <div class="guard-card">
          <div class="spinner"></div>
          <p class="guard-text">Подключение к серверу...</p>
        </div>
      </div>
    } @else if (guard.stateFailed()) {
      <div class="guard-screen">
        <div class="guard-card">
          <p class="guard-text">Нет соединения с сервером</p>
          <button class="refresh-btn" (click)="guard.retry()">Обновить</button>
        </div>
      </div>
    } @else {
      <safe-totp-gate [baseUrl]="guardBase" [session]="guard.session()"></safe-totp-gate>
    }
  `,
  styles: [`
    :host {
      display: flex;
      justify-content: center;
      min-height: 100vh;
      padding: 40px 16px;
    }
    .guard-screen {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 100%;
      min-height: 60vh;
    }
    .guard-card { text-align: center; }
    .spinner {
      width: 32px; height: 32px;
      border: 3px solid #2a323d;
      border-top-color: #8ab4ff;
      border-radius: 50%;
      margin: 0 auto 12px;
      animation: spin 0.8s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    .guard-text { color: #9aa4b1; font-size: 13px; margin: 0; }
    .refresh-btn {
      margin-top: 14px;
      padding: 8px 22px;
      font-size: 14px;
      border-radius: 8px;
      border: 1px solid #3753d8;
      background: #1a2029;
      color: #8ab4ff;
      cursor: pointer;
    }
    .refresh-btn:hover { background: #0f1419; }
  `],
})
export class AppComponent {
  guardEnabled = false;
  guardBase = '/totp';

  constructor(public auth: AuthService, private admin: AdminService, public guard: TotpGuardService) {
    const base = (WEB_BACK_URL || (document.querySelector('base')?.getAttribute('href') ?? '')).replace(/\/+$/, '');
    this.guardBase = base || '/totp';
    auth.configure(this.guardBase);
    admin.configure(this.guardBase);
    if (TOTP_URL) {
      this.guardEnabled = true;
      guard.configure({ remoteUrl: TOTP_URL, baseUrl: this.guardBase });
      void guard.init();
    }
  }
}