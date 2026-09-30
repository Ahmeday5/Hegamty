import { DestroyRef, Signal, computed, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Observable, Subject, catchError, map, of, switchMap } from 'rxjs';
import { ApiError } from '../models/api-response.model';

export type RecordState = 'loading' | 'ready' | 'not-found' | 'error';

type Outcome<T> = { state: 'ready'; value: T } | { state: 'not-found' } | { state: 'error'; message: string };

export interface RecordLoaderOptions {
  destroyRef: DestroyRef;
  /** Shown when the server gives no usable error message. */
  errorMessage: string;
  /** Ids failing this never reach the API (e.g. a mistyped deep link) — they resolve to `not-found`. */
  isValidId?: (id: string) => boolean;
}

/**
 * Loads one record by id for a detail view. A new `load()` cancels the one
 * in flight; 404s become `not-found` rather than an error. `set()` applies a
 * locally known change (e.g. after an action whose response has no body).
 */
export class RecordLoader<T> {
  private readonly current = signal<T | null>(null);
  private readonly lifecycle = signal<RecordState>('loading');
  private readonly failure = signal<string | null>(null);
  private readonly requests = new Subject<string>();
  private lastId: string | null = null;

  readonly value: Signal<T | null> = this.current.asReadonly();
  readonly state: Signal<RecordState> = this.lifecycle.asReadonly();
  readonly error: Signal<string | null> = this.failure.asReadonly();
  readonly loading = computed(() => this.lifecycle() === 'loading');

  constructor(fetch: (id: string) => Observable<T>, options: RecordLoaderOptions) {
    this.requests
      .pipe(
        switchMap((id): Observable<Outcome<T>> => {
          if (options.isValidId && !options.isValidId(id)) return of({ state: 'not-found' });
          return fetch(id).pipe(
            map((value): Outcome<T> => ({ state: 'ready', value })),
            catchError((err: ApiError) =>
              of<Outcome<T>>(
                err?.status === 404 ? { state: 'not-found' } : { state: 'error', message: err?.message || options.errorMessage },
              ),
            ),
          );
        }),
        takeUntilDestroyed(options.destroyRef),
      )
      .subscribe((out) => {
        this.current.set(out.state === 'ready' ? out.value : null);
        this.failure.set(out.state === 'error' ? out.message : null);
        this.lifecycle.set(out.state);
      });
  }

  load(id: string): void {
    this.lastId = id;
    this.lifecycle.set('loading');
    this.failure.set(null);
    this.requests.next(id);
  }

  reload(): void {
    if (this.lastId !== null) this.load(this.lastId);
  }

  set(value: T): void {
    this.current.set(value);
  }
}
