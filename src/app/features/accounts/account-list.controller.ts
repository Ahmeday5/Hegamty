import { DestroyRef, Signal, WritableSignal, computed, effect, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { debounceTime, distinctUntilChanged, map } from 'rxjs';
import { PageRequest } from '../../core/models/page.model';
import { AccountSearch, parseAccountSearch } from './account-search';

export const ACCOUNT_PAGE_SIZES = [10, 25, 50, 100] as const;
const SEARCH_DEBOUNCE_MS = 350;

export type BanFilter = 'all' | 'banned' | 'allowed';
const BAN_VALUES: readonly BanFilter[] = ['all', 'banned', 'allowed'];

export interface AccountListQuery<S extends string> {
  search: AccountSearch;
  status: S | null;
  /** `true` = banned only, `false` = not banned only. */
  banned: boolean | null;
  page: PageRequest;
}

export interface AccountListOptions {
  /** Enables the banned / not-banned filter (`?ban=`). */
  banFilter?: boolean;
}

/** Page number bound to the filter it was chosen under — any filter change starts back at page 1. */
interface PageState {
  filterKey: string;
  index: number;
}

/**
 * Filter + paging state of a server-paged accounts list, mirrored in the URL
 * (`?q=&status=&ban=&page=&size=`) so views can be linked and survive reloads.
 * Create it in a component field initializer (it needs an injection context)
 * and feed `query()` to the store from an effect.
 */
export class AccountListController<S extends string> {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly params = this.route.snapshot.queryParamMap;
  /** Last `q` this controller wrote, to tell its own URL updates from outside navigation. */
  private writtenQ: string | null = this.params.get('q');

  readonly search = signal(this.params.get('q') ?? '');
  readonly status: WritableSignal<S | 'all'>;
  readonly ban: WritableSignal<BanFilter>;
  readonly pageSize = signal<number>(this.parsePageSize(this.params.get('size')));

  /** The typed text, settled — so the API isn't hit on every keystroke. */
  private readonly term = toSignal(
    toObservable(this.search).pipe(
      debounceTime(SEARCH_DEBOUNCE_MS),
      map((q) => q.trim()),
      distinctUntilChanged(),
    ),
    { initialValue: this.search().trim() },
  );

  private readonly filterKey = computed(() => `${this.term()}|${this.status()}|${this.ban()}`);
  private readonly pageState: WritableSignal<PageState>;

  readonly pageIndex = computed(() => {
    const s = this.pageState();
    return s.filterKey === this.filterKey() ? s.index : 1;
  });

  readonly query: Signal<AccountListQuery<S>> = computed(() => {
    const status = this.status();
    const ban = this.ban();
    return {
      search: parseAccountSearch(this.term()),
      status: status === 'all' ? null : status,
      banned: ban === 'all' ? null : ban === 'banned',
      page: { pageIndex: this.pageIndex(), pageSize: this.pageSize() },
    };
  });

  readonly hasFilters = computed(() => !!this.search().trim() || this.status() !== 'all' || this.ban() !== 'all');

  /** @param statuses the status filter values this list accepts (besides `'all'`). */
  constructor(statuses: readonly S[], options: AccountListOptions = {}) {
    const status = this.params.get('status') as S | null;
    this.status = signal(status && statuses.includes(status) ? status : 'all');
    const ban = this.params.get('ban') as BanFilter | null;
    this.ban = signal(options.banFilter && ban && BAN_VALUES.includes(ban) ? ban : 'all');
    this.pageState = signal({ filterKey: this.filterKey(), index: Math.max(1, Number(this.params.get('page')) || 1) });

    effect(() => {
      const status = this.status();
      const ban = this.ban();
      const page = this.pageIndex();
      const size = this.pageSize();
      this.writtenQ = this.term() || null;
      this.router.navigate([], {
        relativeTo: this.route,
        queryParams: {
          q: this.writtenQ,
          status: status === 'all' ? null : status,
          ban: ban === 'all' ? null : ban,
          page: page > 1 ? page : null,
          size: size !== ACCOUNT_PAGE_SIZES[0] ? size : null,
        },
        queryParamsHandling: 'merge',
        replaceUrl: true,
      });
    });

    // A search arriving from outside while the page is open (e.g. the header's global search).
    this.route.queryParamMap.pipe(takeUntilDestroyed(inject(DestroyRef))).subscribe((p) => {
      const q = p.get('q');
      if (q !== this.writtenQ) {
        this.writtenQ = q;
        this.search.set(q ?? '');
      }
    });
  }

  setStatus(status: S | 'all'): void {
    this.status.set(status);
  }

  setBan(ban: BanFilter): void {
    this.ban.set(ban);
  }

  goToPage(index: number): void {
    this.pageState.set({ filterKey: this.filterKey(), index });
  }

  changePageSize(size: number): void {
    // Keep the first visible row on screen after resizing.
    const firstRow = (this.pageIndex() - 1) * this.pageSize();
    this.pageSize.set(size);
    this.pageState.set({ filterKey: this.filterKey(), index: Math.floor(firstRow / size) + 1 });
  }

  reset(): void {
    this.search.set('');
    this.status.set('all');
    this.ban.set('all');
  }

  private parsePageSize(value: string | null): number {
    const n = Number(value);
    return (ACCOUNT_PAGE_SIZES as readonly number[]).includes(n) ? n : ACCOUNT_PAGE_SIZES[0];
  }
}
