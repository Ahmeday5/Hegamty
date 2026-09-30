import { Routes } from '@angular/router';

/** Mounted at `/technicians` (the UI's name for the backend's specialists). */
export const specialistsRoutes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./pages/specialists-list/specialists-list.component').then((m) => m.SpecialistsListComponent),
  },
  {
    path: ':id',
    loadComponent: () =>
      import('./pages/specialist-detail/specialist-detail.component').then((m) => m.SpecialistDetailComponent),
  },
];
