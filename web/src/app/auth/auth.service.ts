import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap } from 'rxjs';

export type AuthResponse = {
  token: string;
  user: { id: number; email: string };
};

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly storageKey = 'totp_jwt';
  private baseUrl = '';

  constructor(private http: HttpClient) {}

  configure(apiPrefix: string): void {
    this.baseUrl = apiPrefix;
  }

  get token(): string | null {
    try {
      return localStorage.getItem(this.storageKey);
    } catch {
      return null;
    }
  }

  get isLoggedIn(): boolean {
    const t = this.token;
    if (!t) return false;
    try {
      const payload = JSON.parse(atob(t.split('.')[1]));
      return !!payload.email;
    } catch {
      this.logout();
      return false;
    }
  }

  get userEmail(): string {
    const t = this.token;
    if (!t) return '';
    try {
      const payload = JSON.parse(atob(t.split('.')[1]));
      return payload.email ?? '';
    } catch {
      return '';
    }
  }

  login(email: string, password: string): Observable<AuthResponse> {
    return this.http
      .post<AuthResponse>(`${this.baseUrl}/auth/login`, { email, password })
      .pipe(tap((res) => this.storeToken(res.token)));
  }

  register(email: string, password: string): Observable<AuthResponse> {
    return this.http
      .post<AuthResponse>(`${this.baseUrl}/auth/register`, { email, password })
      .pipe(tap((res) => this.storeToken(res.token)));
  }

  logout(): void {
    try {
      localStorage.removeItem(this.storageKey);
    } catch {
      /* ignore */
    }
  }

  private storeToken(token: string): void {
    try {
      localStorage.setItem(this.storageKey, token);
    } catch {
      /* ignore */
    }
  }
}
