import { Component, CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { AuthService } from './auth/auth.service';
import { AdminService } from './admin/admin.service';
import { AdminComponent } from './admin/admin.component';
import { AuthFlowService } from './auth-flow/auth-flow.service';
import { AuthFeatureComponent } from './auth-flow/auth-feature.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [AdminComponent, AuthFeatureComponent],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  template: `
    @if (flow.done()) {
      <app-admin></app-admin>
    } @else {
      <auth-feature [baseUrl]="base"></auth-feature>
    }
  `,
})
export class AppComponent {
  base = '/totp';

  constructor(public flow: AuthFlowService, private auth: AuthService, private admin: AdminService) {
    const base = (WEB_BACK_URL || (document.querySelector('base')?.getAttribute('href') ?? '')).replace(/\/+$/, '');
    this.base = base || '/totp';
    auth.configure(this.base);
    admin.configure(this.base);
  }
}