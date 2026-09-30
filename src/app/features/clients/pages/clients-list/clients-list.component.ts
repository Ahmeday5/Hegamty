import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, signal, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import { IconComponent } from '../../../../shared/components/icon/icon.component';
import { AvatarComponent } from '../../../../shared/components/avatar/avatar.component';
import { KpiCardComponent } from '../../../../shared/components/kpi-card/kpi-card.component';
import { PaginationComponent } from '../../../../shared/components/pagination/pagination.component';
import { DevBadgeComponent } from '../../../../shared/components/dev-status/dev-badge.component';
import { FORMAT_PIPES } from '../../../../shared/pipes/format.pipes';
import { downloadCsv } from '../../../../shared/utils/csv.util';
import { formatDate } from '../../../../shared/utils/format.util';
import { ToastService } from '../../../../core/services/toast.service';
import { ApiError } from '../../../../core/models/api-response.model';
import { apiErrorToMessage } from '../../../../core/utils/api-error.util';
import { ALL_COUNTRIES, CountryScopeService } from '../../../countries/country-scope.service';
import { CountryFlagComponent } from '../../../countries/country-flag.component';
import { ACCOUNT_PAGE_SIZES, AccountListController, BanFilter } from '../../../accounts/account-list.controller';
import { CLIENT_ACTIVITY_META, Client, ClientActivity, activityOf, isNewClient } from '../../clients.models';
import { ClientsStore } from '../../clients.store';
import { ClientActionsService } from '../../client-actions.service';

const ACTIVITIES: readonly ClientActivity[] = ['active', 'inactive'];

/**
 * Customers list, fully server-driven: search (name or phone), activity and
 * paging go to the API and are mirrored in the URL. Country / governorate
 * filtering isn't supported by the backend yet.
 */
@Component({
  selector: 'app-clients-list',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    IconComponent,
    AvatarComponent,
    KpiCardComponent,
    PaginationComponent,
    DevBadgeComponent,
    CountryFlagComponent,
    ...FORMAT_PIPES,
  ],
  templateUrl: './clients-list.component.html',
  styleUrl: './clients-list.component.scss',
})
export class ClientsListComponent {
  private readonly store = inject(ClientsStore);
  private readonly actions = inject(ClientActionsService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly scope = inject(CountryScopeService);

  protected readonly list = new AccountListController<ClientActivity>(ACTIVITIES, { banFilter: true });
  protected readonly activityMeta = CLIENT_ACTIVITY_META;
  protected readonly activityOf = activityOf;
  protected readonly isNew = isNewClient;
  protected readonly pageSizes = ACCOUNT_PAGE_SIZES;
  protected readonly skeletonRows = Array.from({ length: 8 }, (_, i) => i);

  protected readonly rows = this.store.items;
  protected readonly pageMeta = this.store.page;
  protected readonly status = this.store.status;
  protected readonly loadError = this.store.error;
  protected readonly busy = this.actions.busy;
  protected readonly exporting = signal(false);

  /** Skeleton only on a cold load; later queries keep the stale rows (dimmed) until the new page lands. */
  protected readonly firstLoad = computed(() => this.status() !== 'ready' && this.status() !== 'error' && !this.rows().length);

  protected readonly statusTabs = computed(() => {
    const c = this.store.counts();
    return [
      { id: 'all' as const, label: 'الكل', count: c?.all },
      { id: 'active' as const, label: CLIENT_ACTIVITY_META.active.label, count: c?.active },
      { id: 'inactive' as const, label: CLIENT_ACTIVITY_META.inactive.label, count: c?.inactive },
    ];
  });

  protected readonly banTabs: { id: BanFilter; label: string }[] = [
    { id: 'all', label: 'الكل' },
    { id: 'allowed', label: 'غير محظور' },
    { id: 'banned', label: 'محظور' },
  ];

  protected readonly kpis = computed(() => {
    const c = this.store.counts();
    const all = c?.all ?? 0;
    const active = c?.active ?? 0;
    return { all, active, inactive: c?.inactive ?? 0, activeShare: all ? Math.round((active / all) * 100) : 0 };
  });

  constructor() {
    effect(
      () => {
        const { search, status, banned, page } = this.list.query();
        untracked(() => this.store.query({ ...search, active: status === null ? null : status === 'active', banned }, page));
      },
      { allowSignalWrites: true },
    );
    this.store.refreshCounts();
  }

  protected reload(): void {
    this.store.reload();
  }

  protected goToPage(index: number): void {
    this.list.goToPage(index);
    queueMicrotask(() => document.querySelector('.acc-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  }

  protected showAllCountries(): void {
    this.scope.select(ALL_COUNTRIES);
  }

  protected openDetails(c: Client): void {
    this.router.navigate(['/customers', c.id]);
  }

  protected toggleBan(c: Client): void {
    this.actions.toggleBan(c);
  }

  protected exportCsv(): void {
    if (this.exporting()) return;
    this.exporting.set(true);
    this.store
      .exportRows()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (rows) => {
          this.exporting.set(false);
          if (!rows.length) {
            this.toast.info('لا توجد بيانات للتصدير');
            return;
          }
          const header = ['المعرف', 'الاسم', 'رقم الجوال', 'البريد', 'العمر', 'الدولة', 'المحافظة', 'الحالة', 'محظور', 'تاريخ التسجيل'];
          downloadCsv(
            'customers',
            header,
            rows.map((c) => [
              c.id, c.fullName, c.phone, c.email, c.age ?? '', c.countryName, c.governorateName,
              CLIENT_ACTIVITY_META[activityOf(c)].label, c.banned ? 'نعم' : 'لا', c.createdAt ? formatDate(c.createdAt) : '',
            ]),
          );
          this.toast.success(`تم تصدير ${rows.length} عميل`);
        },
        error: (err: ApiError) => {
          this.exporting.set(false);
          this.toast.error(apiErrorToMessage(err, 'تعذّر تصدير البيانات، حاول مرة أخرى.'));
        },
      });
  }
}
