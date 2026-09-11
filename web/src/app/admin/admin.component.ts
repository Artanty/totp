import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AdminService, type App, type CreateAppResponse } from './admin.service';
import { AuthService } from '../auth/auth.service';
import { AuthFlowService } from '../auth-flow/auth-flow.service';
import { TotpGuardService } from '../guard/totp-guard.service';

@Component({
  selector: 'app-admin',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="layout">
      <div class="card">
        <h1>TOTP · apps</h1>

        <div class="user-bar">
          <span>Signed in as <b>{{ auth.userEmail }}</b></span>
          <button class="link" (click)="lock()" title="Lock TOTP session">lock</button>
          <button class="link" (click)="logout()">sign out</button>
        </div>

        <h2>Add app</h2>
        <label for="name">App name</label>
        <input id="name" type="text" placeholder="My App" [(ngModel)]="appName">
        <label for="slug">Slug (optional)</label>
        <input id="slug" type="text" placeholder="my-app (auto from name)" [(ngModel)]="appSlug">
        <p class="error" *ngIf="addError">{{ addError }}</p>
        <button (click)="createApp()" [disabled]="creating">Create app</button>

        <div class="result" *ngIf="lastCreated">
          <p class="muted">Scan into an authenticator, then copy the credentials into the app's env:</p>
          <img [src]="lastCreated.qrDataUrl" alt="QR" class="qr">
          <code>{{ envBlock }}</code>
          <p class="muted">The password is shown once — copy it before closing.</p>
        </div>

        <h2>Apps</h2>
        <table>
          <thead><tr><th>Name</th><th>Slug</th><th>Token</th><th></th></tr></thead>
          <tbody>
            <tr *ngFor="let a of apps">
              <td>{{ a.name }}</td>
              <td>{{ a.slug }}</td>
              <td>token {{ a.tokenId }}</td>
              <td><button class="link danger" (click)="revokeApp(a.id)">revoke</button></td>
            </tr>
          </tbody>
        </table>
      </div>

      <aside class="guide">
        <h2>Подключение нового приложения</h2>
        <div class="intro">Шаги 1–6 — создание приложения и добавление в Authy.</div>
        <ol>
          <li>Укажите имя в поле <b>App name</b> (поле <b>Slug</b> можно оставить пустым) и нажмите <b>Create app</b>.</li>
          <li><b>Добавьте приложение в Authy:</b>
            <ul>
              <li>В Authy нажмите <b>+</b> (Add account).</li>
              <li>Выберите <b>Scan QR code</b> и наведите камеру на QR-код.</li>
              <li>Если скан недоступен — <b>Enter key manually</b> и вставьте otpauth-URI или секрет.</li>
            </ul>
          </li>
          <li>Скопируйте блок <code class="inline">.env</code> в конфигурацию приложения.</li>
          <li>Приложение будет проверять 6-значные коды через <code class="inline">POST /totp/tokens/{{'{id}'}}/verify</code>.</li>
          <li>Пароль показывается <b>один раз</b> — сохраните его.</li>
        </ol>
        <div class="hint">Каждое приложение изолировано: у него свой секрет и свои коды.</div>
        <div class="hint">Чтобы отозвать доступ, нажмите <b>revoke</b> в списке.</div>
      </aside>
    </div>
  `,
  styles: [`
    .layout {
      display: flex; gap: 20px; align-items: stretch;
      width: 100%; max-width: 1120px; margin: 0 auto;
    }
    .card {
      background: #1a2029; border: 1px solid #2a323d; border-radius: 12px;
      padding: 24px; flex: 1 1 560px; max-width: 560px; order: 1;
    }
    .guide {
      flex: 1 1 340px; min-width: 300px; max-width: 440px;
      background: #1a2029; border: 1px solid #2a323d; border-radius: 12px; padding: 24px; order: 2;
    }
    @media (max-width: 940px) {
      .layout { flex-wrap: wrap; }
      .card { max-width: 100%; }
    }
    .guide h2 { margin: 0 0 6px; font-size: 16px; }
    .guide .intro { margin: 0 0 14px; color: #9aa4b1; font-size: 13px; }
    .guide ol, .guide ul { margin: 0; padding-left: 20px; }
    .guide li { margin: 0 0 12px; font-size: 13px; line-height: 1.55; }
    .guide b { color: #e6e6e6; }
    .guide .hint { border-left: 3px solid #3753d8; padding: 10px 12px; margin-top: 16px; background: #0f1419; border-radius: 0 8px 8px 0; font-size: 12px; color: #9aa4b1; }
    .guide .hint + .hint { margin-top: 8px; }
    .guide code.inline { display: inline; padding: 1px 5px; border: 1px solid #2a323d; border-radius: 4px; font-size: 12px; background: #0f1419; }
    h1 { margin: 0 0 20px; font-size: 22px; }
    h2 { margin: 24px 0 12px; font-size: 16px; }
    label { display: block; font-size: 13px; margin: 12px 0 4px; color: #9aa4b1; }
    input {
      width: 100%; padding: 10px; background: #0f1419; color: #e6e6e6;
      border: 1px solid #2a323d; border-radius: 8px; font-size: 14px;
    }
    button {
      display: inline-block; margin-top: 16px; padding: 10px 18px;
      background: #3753d8; color: #fff; border: none; border-radius: 8px;
      font-size: 14px; cursor: pointer;
    }
    button:disabled { opacity: .5; cursor: default; }
    button.danger { background: #b3303a; }
    .link { background: none; color: #8ab4ff; border: none; padding: 4px 8px; margin: 0; cursor: pointer; font-size: 13px; }
    .user-bar { display: flex; gap: 8px; align-items: center; }
    .error { color: #ff8a80; font-size: 13px; margin-top: 12px; }
    .result { margin-top: 20px; border-top: 1px solid #2a323d; padding-top: 16px; }
    .qr { width: 160px; height: 160px; image-rendering: pixelated; background: #fff; border-radius: 8px; padding: 4px; }
    code { background: #0f1419; border: 1px solid #2a323d; border-radius: 6px; padding: 10px; display: block; font-size: 12px; white-space: pre-wrap; word-break: break-all; margin-top: 8px; }
    table { width: 100%; border-collapse: collapse; margin-top: 8px; font-size: 13px; }
    th, td { text-align: left; padding: 8px 4px; border-bottom: 1px solid #232a33; }
    th { color: #9aa4b1; font-weight: 500; }
    .muted { color: #9aa4b1; font-size: 12px; }
  `],
})
export class AdminComponent implements OnInit {
  apps: App[] = [];
  appName = '';
  appSlug = '';
  addError = '';
  creating = false;
  lastCreated: CreateAppResponse | null = null;

  constructor(
    private admin: AdminService,
    public auth: AuthService,
    private guard: TotpGuardService,
    private flow: AuthFlowService,
  ) {}

  ngOnInit(): void {
    this.loadApps();
  }

  get envBlock(): string {
    if (!this.lastCreated) return '';
    const i = this.lastCreated.integration;
    return [
      `TOTP_SERVICE_URL=${i.totp_service_url}`,
      `TOTP_SERVICE_USER=${i.totp_service_user}`,
      `TOTP_SERVICE_PASSWORD=${i.totp_service_password}`,
      `TOTP_TOKEN_ID=${i.totp_token_id}`,
    ].join('\n');
  }

  loadApps(): void {
    this.admin.listApps().subscribe({
      next: (apps) => (this.apps = apps),
      error: (err) => (this.addError = err.error?.error ?? err.message),
    });
  }

  createApp(): void {
    this.addError = '';
    this.lastCreated = null;
    if (!this.appName.trim()) { this.addError = 'Name is required'; return; }
    this.creating = true;
    this.admin.createApp(this.appName.trim(), this.appSlug.trim() || undefined).subscribe({
      next: (res) => {
        this.lastCreated = res;
        this.creating = false;
        this.loadApps();
      },
      error: (err) => {
        this.addError = err.error?.error ?? err.message;
        this.creating = false;
      },
    });
  }

  revokeApp(id: number): void {
    if (!confirm('Revoke this app? The gate user and its token will be deleted.')) return;
    this.admin.deleteApp(id).subscribe({
      next: () => this.loadApps(),
      error: (err) => alert(err.error?.error ?? err.message),
    });
  }

  lock(): void {
    this.guard.lock();
    this.flow.reset();
  }

  logout(): void {
    this.guard.lock();
    this.auth.logout();
    this.flow.reset();
  }
}
