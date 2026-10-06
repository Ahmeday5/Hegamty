import { DestroyRef, Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { Page, PageRequest } from '../../core/models/page.model';
import { PagedQuery } from '../../core/utils/paged-query';
import { AccountLocationFilter, locationKey } from '../accounts/account-profile';
import { BanFilteredPages, byBan } from '../accounts/ban-filtered-pages';
import { ScopedCounts } from '../../core/utils/scoped-counts';
import { ClientsApi } from './clients.api';
import { Client, ClientCounts, ClientFilter, NO_CLIENT_FILTER } from './clients.models';

const locationOf = ({ countryId, governorateId }: ClientFilter): AccountLocationFilter => ({ countryId, governorateId });

/**
 * Customers list state: one page for the current filters plus the activity
 * totals (for the listed residence area) behind the KPIs and tabs. Ban /
 * unban patch the listed row with their known outcome and return the updated record.
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

  private readonly totals = new ScopedCounts<ClientCounts, AccountLocationFilter>((loc) => this.api.counts(loc), locationKey, this.destroyRef);

  readonly items = this.list.items;
  readonly page = this.list.page;
  readonly status = this.list.status;
  readonly error = this.list.error;
  /** `null` while loading (or when the last refresh failed). */
  readonly counts = this.totals.value;

  /** Totals follow the listed residence area; they're fetched only when that changes (or after `expireCounts()`). */
  query(filter: ClientFilter, page: PageRequest): void {
    this.list.query(filter, page);
    this.totals.ensure(locationOf(filter));
  }

  reload(): void {
    this.banFiltered.invalidate();
    this.list.reload();
    this.refreshCounts();
  }

  refreshCounts(): void {
    this.totals.refresh(locationOf(this.list.filter));
  }

  /** Call when the list page opens, so the next query brings fresh totals. */
  expireCounts(): void {
    this.totals.expire();
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
