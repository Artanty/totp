import { Routes } from '@angular/router';
import { AdminComponent } from './admin/admin.component';

export const routes: Routes = [
  { path: '', redirectTo: 'ui', pathMatch: 'full' },
  { path: 'ui', component: AdminComponent },
];