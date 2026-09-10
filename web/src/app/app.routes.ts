import { Routes } from '@angular/router';
import { LoginComponent } from './auth/login/login.component';
import { AdminComponent } from './admin/admin.component';

export const routes: Routes = [
  { path: '', redirectTo: 'ui', pathMatch: 'full' },
  { path: 'ui', component: AdminComponent },
  { path: 'login', component: LoginComponent },
];
