import { Routes } from '@angular/router';

/** Mounted at `/customers` (the UI's name for the backend's clients). */
export const clientsRoutes: Routes = [
  {
    path: '',
    loadComponent: () => import('./pages/clients-list/clients-list.component').then((m) => m.ClientsListComponent),
  },
  {
    path: ':id',
    loadComponent: () => import('./pages/client-detail/client-detail.component').then((m) => m.ClientDetailComponent),
  },
];
