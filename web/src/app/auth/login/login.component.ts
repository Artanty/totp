import { Component, EventEmitter, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="login-card">
      <h1>TOTP · apps</h1>

      <label for="email">Email</label>
      <input id="email" type="email" autocomplete="username" placeholder="admin@totp.local"
             [(ngModel)]="email">

      <label for="password">Password</label>
      <input id="password" type="password" autocomplete="current-password" placeholder="at least 8 characters"
             [(ngModel)]="password" (keydown.enter)="submit()">

      <div *ngIf="authMode === 'register'">
        <label for="confirm">Confirm password</label>
        <input id="confirm" type="password" autocomplete="new-password"
               [(ngModel)]="confirmPassword" (keydown.enter)="submit()">
      </div>

      <p class="error" *ngIf="error">{{ error }}</p>

      <button (click)="submit()" [disabled]="submitting">
        {{ authMode === 'register' ? 'Create account' : 'Sign in' }}
      </button>

      <button class="link" (click)="toggleMode()">
        {{ authMode === 'register' ? 'Already have an account? Sign in' : 'No account? Create one' }}
      </button>
    </div>
  `,
  styles: [`
    .login-card { width: 100%; max-width: 560px; }
    h1 { margin: 0 0 20px; font-size: 22px; }
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
    .link { background: none; color: #8ab4ff; border: none; padding: 0; margin: 12px 0 0; cursor: pointer; font-size: 13px; }
    .error { color: #ff8a80; font-size: 13px; margin-top: 12px; }
  `],
})
export class LoginComponent {
  @Output() loggedIn = new EventEmitter<void>();

  email = '';
  password = '';
  confirmPassword = '';
  authMode: 'login' | 'register' = 'login';
  error = '';
  submitting = false;

  constructor(private auth: AuthService) {}

  toggleMode(): void {
    this.authMode = this.authMode === 'login' ? 'register' : 'login';
    this.error = '';
  }

  submit(): void {
    this.error = '';
    if (!this.email) { this.error = 'Email is required'; return; }
    if (this.password.length < 8) { this.error = 'Password must be at least 8 characters'; return; }
    if (this.authMode === 'register' && this.password !== this.confirmPassword) {
      this.error = 'Passwords do not match';
      return;
    }

    this.submitting = true;
    const req = this.authMode === 'register'
      ? this.auth.register(this.email, this.password)
      : this.auth.login(this.email, this.password);

    req.subscribe({
      next: () => {
        this.submitting = false;
        this.loggedIn.emit();
      },
      error: (err) => {
        this.submitting = false;
        if (this.authMode === 'register' && err.status === 409) {
          this.authMode = 'login';
          this.error = 'That email is already registered — sign in instead';
        } else {
          this.error = err.error?.error ?? err.message ?? 'Unknown error';
        }
      },
    });
  }
}
