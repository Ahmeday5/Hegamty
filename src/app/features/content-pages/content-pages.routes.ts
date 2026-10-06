import { Routes } from '@angular/router';
import { unsavedChangesGuard } from '../../core/guards/unsaved-changes.guard';
import { ContentPageKind } from './content-pages.models';

const page = (path: string, kind: ContentPageKind, title: string) => ({
  path,
  title: `${title} · HiCan`,
  // `data.kind` is bound to the component's `kind` input (withComponentInputBinding).
  data: { kind },
  canDeactivate: [unsavedChangesGuard],
  loadComponent: () => import('./pages/content-page/content-page.component').then((m) => m.ContentPageComponent),
});

/** Mounted at `/content` — the app's static pages. */
export const contentPagesRoutes: Routes = [
  page('about-us', 'about', 'من نحن'),
  page('privacy-policy', 'privacy', 'سياسة الخصوصية'),
  { path: '', redirectTo: 'about-us', pathMatch: 'full' },
];
