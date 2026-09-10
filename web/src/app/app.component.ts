import { Component } from '@angular/core';
import { AuthService } from './auth/auth.service';
import { AdminService } from './admin/admin.service';
import { LoginComponent } from './auth/login/login.component';
import { AdminComponent } from './admin/admin.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [LoginComponent, AdminComponent],
  template: `
    @if (!auth.isLoggedIn) {
      <app-login></app-login>
    }
    @if (auth.isLoggedIn) {
      <app-admin></app-admin>
    }
  `,
  styles: [`
    :host {
      display: flex;
      justify-content: center;
      min-height: 100vh;
      padding: 40px 16px;
    }
  `],
})
export class AppComponent {
  constructor(public auth: AuthService, private admin: AdminService) {
    const base = (WEB_BACK_URL || (document.querySelector('base')?.getAttribute('href') ?? '')).replace(/\/+$/, '');
    auth.configure(base || '/totp');
    admin.configure(base || '/totp');
  }
}