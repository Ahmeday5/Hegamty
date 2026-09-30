import { Signal, signal } from '@angular/core';
import { Observable, defer, finalize } from 'rxjs';

/**
 * Ids with an action in flight — lets every view of a record (list row,
 * detail page) disable its buttons while one request runs.
 */
export class BusySet {
  private readonly set = signal<ReadonlySet<string>>(new Set());
  readonly ids: Signal<ReadonlySet<string>> = this.set.asReadonly();

  has(id: string): boolean {
    return this.set().has(id);
  }

  /** Marks `id` busy for the lifetime of `source` (subscription to completion/error). */
  track<T>(id: string, source: Observable<T>): Observable<T> {
    return defer(() => {
      this.toggle(id, true);
      return source.pipe(finalize(() => this.toggle(id, false)));
    });
  }

  private toggle(id: string, on: boolean): void {
    this.set.update((current) => {
      const next = new Set(current);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }
}
