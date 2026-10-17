import { Routes } from '@angular/router';
import { authGuard } from './core/auth.guard';

export const routes: Routes = [
  { path: '', loadComponent: () => import('./auth/auth').then(m => m.AuthComponent) },
  { path: 'main', canActivate: [authGuard], loadComponent: () => import('./main/main').then(m => m.MainComponent) },
  { path: 'profile', canActivate: [authGuard], loadComponent: () => import('./profile/profile').then(m => m.ProfileComponent) },
  { path: 'chat', canActivate: [authGuard], loadComponent: () => import('./chat/chat').then(m => m.ChatComponent) },
  { path: '**', redirectTo: '' }
];
