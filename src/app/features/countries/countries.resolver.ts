import { inject } from '@angular/core';
import { ResolveFn } from '@angular/router';
import { catchError, map, of } from 'rxjs';
import { CountriesStore } from './countries.store';

/**
 * Loads the countries catalog before the app shell renders: the country
 * switcher, the country scope and every country-keyed store read it on first
 * use. A failed load never blocks navigation — the store exposes the error
 * and the countries page offers a retry.
 */
export const countriesResolver: ResolveFn<boolean> = () =>
  inject(CountriesStore)
    .ensureLoaded()
    .pipe(
      map(() => true),
      catchError(() => of(false)),
    );
