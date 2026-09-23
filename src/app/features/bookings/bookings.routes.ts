import { Routes } from '@angular/router';

export const bookingsRoutes: Routes = [
  {
    path: '',
    loadComponent: () => import('./pages/bookings-list/bookings-list.component').then((m) => m.BookingsListComponent),
  },
  {
    path: ':id',
    loadComponent: () => import('./pages/booking-detail/booking-detail.component').then((m) => m.BookingDetailComponent),
  },
];
