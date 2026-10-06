import { DestroyRef, Signal, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Observable, Subject, catchError, of, switchMap } from 'rxjs';

/**
 * Totals behind a list's KPIs and tabs, for one scope (country, search…) at
 * a time. A new request cancels the one in flight; totals of another scope
 * are cleared rather than shown under the wrong filter.
 */
export class ScopedCounts<C, S> {
  private readonly totals = signal<C | null>(null);
  private readonly requests = new Subject<S>();
  /** Scope the current totals belong to. */
  private shownFor: string | null = null;
  private fresh = false;

  /** `null` while loading, or when the last refresh failed. */
  readonly value: Signal<C | null> = this.totals.asReadonly();

  constructor(
    fetch: (scope: S) => Observable<C>,
    private readonly keyOf: (scope: S) => string,
    destroyRef: DestroyRef,
  ) {
    this.requests
      .pipe(
        switchMap((scope) => fetch(scope).pipe(catchError(() => of(null)))),
        takeUntilDestroyed(destroyRef),
      )
      .subscribe((c) => this.totals.set(c));
  }

  /** Fetches unless the totals are already current for `scope`. */
  ensure(scope: S): void {
    if (!this.fresh || this.keyOf(scope) !== this.shownFor) this.refresh(scope);
  }

  refresh(scope: S): void {
    const key = this.keyOf(scope);
    if (key !== this.shownFor) this.totals.set(null);
    this.shownFor = key;
    this.fresh = true;
    this.requests.next(scope);
  }

  /** The next `ensure()` refetches (e.g. when the list page is opened again). */
  expire(): void {
    this.fresh = false;
  }
}
