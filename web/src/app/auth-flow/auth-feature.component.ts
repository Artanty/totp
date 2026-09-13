import { Component, CUSTOM_ELEMENTS_SCHEMA, Input, NgZone, OnInit, effect, signal } from '@angular/core';
import { AuthFlowService } from './auth-flow.service';
import { TotpGuardService } from '../guard/totp-guard.service';
import { AuthService } from '../auth/auth.service';
import { LoginComponent } from '../auth/login/login.component';

/**
 * totp/web admin flow, reordered: login FIRST, then the authenticated TOTP
 * gate (admin JWT + direct /auth/totp/init|verify endpoints). complete() runs
 * once the gate is unlocked for a logged-in user.
 */
@Component({
  selector: 'auth-feature',
  standalone: true,
  imports: [LoginComponent],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  template: `
    @if (!guardEnabled) {
      <app-login (loggedIn)="complete()"></app-login>
    } @else if (!loggedIn()) {
      <app-login (loggedIn)="onLoggedIn()"></app-login>
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
          <button class="refresh-btn" (click)="retry()">Обновить</button>
        </div>
      </div>
    } @else if (!guard.unlocked()) {
      <div class="guard-screen">
        <safe-totp-gate [baseUrl]="baseUrl" [session]="guard.session()"></safe-totp-gate>
      </div>
    }
  `,
  styles: [`
    :host {
      display: flex;
      justify-content: center;
      width: 100%;
      min-height: 100vh;
      padding: 0 16px;
    }
    .guard-screen {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 100%;
      min-height: 100vh;
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
export class AuthFeatureComponent implements OnInit {
  @Input() baseUrl = '/totp';
  readonly bypass = signal(false);
  readonly statusChecked = signal(false);
  readonly loggedIn = signal(false);

  get guardEnabled(): boolean {
    return !!TOTP_URL && !this.bypass();
  }

  constructor(
    public guard: TotpGuardService,
    private auth: AuthService,
    private flow: AuthFlowService,
    private ngZone: NgZone
  ) {
    if (this.auth.isLoggedIn) this.loggedIn.set(true);
    if (!TOTP_URL) this.flow.complete();
    effect(() => {
      if (this.loggedIn() && this.guard.unlocked()) {
        this.ngZone.run(() => this.flow.complete());
      }
    });
    effect(() => {
      if (!this.statusChecked()) return;
      if (this.loggedIn() && !this.guardEnabled) {
        this.ngZone.run(() => this.flow.complete());
        return;
      }
      if (this.loggedIn() && this.guardEnabled) this.startGate();
    });
  }

  ngOnInit(): void {
    if (!TOTP_URL) return;
    void fetch(`${this.baseUrl}/auth/totp/status`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { bypass?: boolean } | null) => {
        this.ngZone.run(() => {
          this.bypass.set(data?.bypass === true);
          this.statusChecked.set(true);
        });
      })
      .catch(() => {
        // Fail closed: if status is unreachable, keep the gate required.
        this.ngZone.run(() => this.statusChecked.set(true));
      });
  }

  private startGate(): void {
    if (!TOTP_URL) return;
    this.guard.configure({
      remoteUrl: TOTP_URL,
      baseUrl: this.baseUrl,
      storagePrefix: 'safe_totp',
      token: this.auth.token ?? undefined,
      stateUrl: `${this.baseUrl}/auth/totp/init`,
      stateMethod: 'POST',
      verifyUrl: `${this.baseUrl}/auth/totp/verify`,
    });
    void this.guard.init();
  }

  onLoggedIn(): void {
    this.loggedIn.set(true);
    if (!TOTP_URL) {
      this.flow.complete();
      return;
    }
    if (this.guardEnabled) this.startGate();
  }

  retry(): void {
    void this.guard.retry();
  }

  complete(): void {
    this.flow.complete();
  }
}