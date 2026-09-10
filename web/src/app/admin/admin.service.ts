import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export type App = {
  id: number;
  name: string;
  slug: string;
  tokenId: number;
  gateEmail: string;
};

export type CreateAppResponse = {
  app: App;
  otpauthUri: string;
  qrDataUrl: string;
  integration: {
    totp_service_url: string;
    totp_service_user: string;
    totp_service_password: string;
    totp_token_id: number;
  };
};

@Injectable({ providedIn: 'root' })
export class AdminService {
  private baseUrl = '';

  constructor(private http: HttpClient) {}

  configure(apiPrefix: string): void {
    this.baseUrl = apiPrefix;
  }

  private authHeaders(): Record<string, string> {
    const token = localStorage.getItem('totp_jwt');
    return token ? { Authorization: `Bearer ${token}` } : {};
  }

  listApps(): Observable<App[]> {
    return this.http.get<App[]>(`${this.baseUrl}/apps`, {
      headers: this.authHeaders(),
    });
  }

  createApp(name: string, slug?: string): Observable<CreateAppResponse> {
    const body: Record<string, string> = { name };
    if (slug) body['slug'] = slug;
    return this.http.post<CreateAppResponse>(`${this.baseUrl}/apps`, body, {
      headers: { ...this.authHeaders(), 'Content-Type': 'application/json' },
    });
  }

  deleteApp(id: number): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/apps/${id}`, {
      headers: this.authHeaders(),
    });
  }
}
