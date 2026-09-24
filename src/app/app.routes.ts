import { Routes } from '@angular/router';
import { authGuard } from './core/auth/guards/auth.guard';
import { guestGuard } from './core/auth/guards/guest.guard';

export const routes: Routes = [
  // Auth area — only reachable when NOT signed in
  {
    path: 'auth',
    canActivate: [guestGuard],
    loadComponent: () =>
      import('./layout/auth-layout/auth-layout.component').then(
        (m) => m.AuthLayoutComponent,
      ),
    children: [
      {
        path: 'login',
        loadComponent: () =>
          import('./features/auth/pages/login/login.component').then(
            (m) => m.LoginComponent,
          ),
      },
      { path: '', redirectTo: 'login', pathMatch: 'full' },
      { path: '**', redirectTo: 'login' },
    ],
  },

  // Authenticated app shell
  {
    path: '',
    canActivate: [authGuard],
    canActivateChild: [authGuard],
    loadComponent: () =>
      import('./layout/main-layout/main-layout.component').then(
        (m) => m.MainLayoutComponent,
      ),
    children: [
      {
        path: 'dashboard',
        title: 'لوحة التحكم · HiCan',
        loadComponent: () =>
          import('./features/dashboard/dashboard.component').then(
            (m) => m.DashboardComponent,
          ),
      },
      {
        path: 'bookings',
        title: 'الحجوزات · HiCan',
        loadChildren: () => import('./features/bookings/bookings.routes').then((m) => m.bookingsRoutes),
      },
      {
        path: 'services',
        title: 'الخدمات · HiCan',
        loadComponent: () =>
          import('./features/services/pages/services-page/services-page.component').then((m) => m.ServicesPageComponent),
      },
      {
        path: 'service-categories',
        title: 'تصنيفات الخدمات · HiCan',
        loadComponent: () =>
          import('./features/services/pages/categories-page/categories-page.component').then((m) => m.CategoriesPageComponent),
      },
      {
        path: 'packages',
        title: 'الباقات · HiCan',
        loadComponent: () =>
          import('./features/packages/pages/packages-page/packages-page.component').then((m) => m.PackagesPageComponent),
      },
      {
        path: 'countries',
        title: 'الدول · HiCan',
        loadComponent: () =>
          import('./features/countries/pages/countries-page/countries-page.component').then((m) => m.CountriesPageComponent),
      },
      {
        path: 'customers',
        title: 'العملاء · HiCan',
        loadChildren: () => import('./features/people/people.routes').then((m) => m.peopleRoutes('customers')),
      },
      {
        path: 'technicians',
        title: 'الفنيون · HiCan',
        loadChildren: () => import('./features/people/people.routes').then((m) => m.peopleRoutes('technicians')),
      },
      {
        path: 'drivers',
        title: 'السائقون · HiCan',
        loadChildren: () => import('./features/people/people.routes').then((m) => m.peopleRoutes('drivers')),
      },
      // Guard a feature with permissions like:
      //   canActivate: [permissionGuard('Users.Manage')]
      { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
    ],
  },

  { path: '**', redirectTo: '/dashboard' },
];
