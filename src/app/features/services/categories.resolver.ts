import { inject } from '@angular/core';
import { ResolveFn } from '@angular/router';
import { catchError, map, of } from 'rxjs';
import { CategoriesStore } from './categories.store';

/**
 * Loads services sections before a page that lists or picks them renders.
 * Never blocks navigation — a failure is exposed by the store and the
 * sections page offers a retry.
 */
export const categoriesResolver: ResolveFn<boolean> = () =>
  inject(CategoriesStore)
    .ensureLoaded()
    .pipe(
      map(() => true),
      catchError(() => of(false)),
    );
