import { Routes } from '@angular/router';

/** Mounted at `/drivers`. */
export const driversRoutes: Routes = [
  {
    path: '',
    loadComponent: () => import('./pages/drivers-list/drivers-list.component').then((m) => m.DriversListComponent),
  },
  {
    path: ':id',
    loadComponent: () => import('./pages/driver-detail/driver-detail.component').then((m) => m.DriverDetailComponent),
  },
];
