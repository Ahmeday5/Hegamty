import { DestroyRef, Signal, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Observable, Subject, catchError, of, switchMap } from 'rxjs';
import { AccountLocationFilter, locationKey } from './account-profile';

/**
 * Totals behind an accounts list's KPIs and tabs, for one location scope at
 * a time. A new request cancels the one in flight; totals of another scope
 * are cleared rather than shown under the wrong country.
 */
export class ScopedCounts<C> {
  private readonly totals = signal<C | null>(null);
  private readonly requests = new Subject<AccountLocationFilter>();
  /** Scope the current totals belong to. */
  private shownFor: string | null = null;
  private fresh = false;

  /** `null` while loading, or when the last refresh failed. */
  readonly value: Signal<C | null> = this.totals.asReadonly();

  constructor(fetch: (location: AccountLocationFilter) => Observable<C>, destroyRef: DestroyRef) {
    this.requests
      .pipe(
        switchMap((location) => fetch(location).pipe(catchError(() => of(null)))),
        takeUntilDestroyed(destroyRef),
      )
      .subscribe((c) => this.totals.set(c));
  }

  /** Fetches unless the totals are already current for `location`. */
  ensure(location: AccountLocationFilter): void {
    if (!this.fresh || locationKey(location) !== this.shownFor) this.refresh(location);
  }

  refresh(location: AccountLocationFilter): void {
    const key = locationKey(location);
    if (key !== this.shownFor) this.totals.set(null);
    this.shownFor = key;
    this.fresh = true;
    this.requests.next(location);
  }

  /** The next `ensure()` refetches (e.g. when the list page is opened again). */
  expire(): void {
    this.fresh = false;
  }
}
