import { DestroyRef, Injectable, Signal, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Observable, Subject, catchError, map, of, switchMap } from 'rxjs';
import { Page, PageRequest } from '../../core/models/page.model';
import { PagedQuery } from '../../core/utils/paged-query';
import { BanFilteredPages, byBan } from '../accounts/ban-filtered-pages';
import { ClientsApi } from './clients.api';
import { Client, ClientCounts, ClientFilter, NO_CLIENT_FILTER } from './clients.models';

/**
 * Customers list state: one page for the current filters plus the activity
 * totals behind the KPIs and tabs. Ban / unban patch the listed row with
 * their known outcome and return the updated record.
 *
 * The API can't filter by ban state yet — with that filter on, pages come
 * from `BanFilteredPages` (browser-side filtering).
 */
@Injectable({ providedIn: 'root' })
export class ClientsStore {
  private readonly api = inject(ClientsApi);
  private readonly destroyRef = inject(DestroyRef);

  private readonly banFiltered = new BanFilteredPages<Client, Omit<ClientFilter, 'banned'>>((f) => this.api.listAll(f));

  private readonly list = new PagedQuery<Client, ClientFilter>((f, p) => this.fetch(f, p), {
    initialFilter: NO_CLIENT_FILTER,
    errorMessage: 'تعذّر تحميل العملاء',
    destroyRef: this.destroyRef,
  });

  readonly items = this.list.items;
  readonly page = this.list.page;
  readonly status = this.list.status;
  readonly error = this.list.error;

  private readonly totals = signal<ClientCounts | null>(null);
  /** `null` until first loaded (or when the last refresh failed). */
  readonly counts: Signal<ClientCounts | null> = this.totals.asReadonly();
  private readonly countRequests = new Subject<void>();

  constructor() {
    this.countRequests
      .pipe(
        switchMap(() => this.api.counts().pipe(catchError(() => of(null)))),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((c) => this.totals.set(c));
  }

  query(filter: ClientFilter, page: PageRequest): void {
    this.list.query(filter, page);
  }

  reload(): void {
    this.banFiltered.invalidate();
    this.list.reload();
    this.refreshCounts();
  }

  refreshCounts(): void {
    this.countRequests.next();
  }

  /** Every customer matching the listed filters (for export). */
  exportRows(): Observable<Client[]> {
    const { banned, ...server } = this.list.filter;
    return this.api.listAll(server).pipe(map((rows) => byBan(rows, banned)));
  }

  ban(c: Client): Observable<Client> {
    return this.api.ban(c.id).pipe(map(() => this.apply({ ...c, banned: true })));
  }

  unban(c: Client): Observable<Client> {
    return this.api.unban(c.id).pipe(map(() => this.apply({ ...c, banned: false })));
  }

  private fetch(filter: ClientFilter, page: PageRequest): Observable<Page<Client>> {
    const { banned, ...server } = filter;
    return banned === null ? this.api.list(server, page) : this.banFiltered.page(server, banned, page);
  }

  private apply(next: Client): Client {
    this.list.patch(next.id, () => next);
    // Ban state changed → cached matches for the ban filter are stale.
    this.banFiltered.invalidate();
    return next;
  }
}
