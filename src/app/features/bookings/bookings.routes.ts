import { Routes } from '@angular/router';

/** No detail route: there's no single-booking endpoint, so a booking opens as a sheet over the list that holds it. */
export const bookingsRoutes: Routes = [
  {
    path: '',
    loadComponent: () => import('./pages/bookings-list/bookings-list.component').then((m) => m.BookingsListComponent),
  },
];
