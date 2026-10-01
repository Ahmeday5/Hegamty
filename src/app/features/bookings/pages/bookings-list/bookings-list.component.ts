import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, signal, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { IconComponent } from '../../../../shared/components/icon/icon.component';
import { KpiCardComponent } from '../../../../shared/components/kpi-card/kpi-card.component';
import { PaginationComponent } from '../../../../shared/components/pagination/pagination.component';
import { FORMAT_PIPES } from '../../../../shared/pipes/format.pipes';
import { downloadCsv } from '../../../../shared/utils/csv.util';
import { formatDate, formatNumber } from '../../../../shared/utils/format.util';
import { ToastService } from '../../../../core/services/toast.service';
import { ApiError } from '../../../../core/models/api-response.model';
import { apiErrorToMessage } from '../../../../core/utils/api-error.util';
import { CountriesStore } from '../../../countries/countries.store';
import { ACCOUNT_PAGE_SIZES, AccountListController } from '../../../accounts/account-list.controller';
import { AccountOptionsService } from '../../../accounts/account-options.service';
import { PartyFilters, PartyFiltersState, partyLocation } from '../../../accounts/party-filters';
import { PartyFiltersComponent } from '../../../accounts/components/party-filters/party-filters.component';
import { BOOKING_STATUSES, BOOKING_STATUS_META, Booking, BookingStatus, PAYMENT_META } from '../../bookings.models';
import { BookingsStore } from '../../bookings.store';
import { BookingSheetService } from '../../booking-sheet.service';
import { BookingsTableComponent } from '../../components/bookings-table/bookings-table.component';

/**
 * Bookings, server-paged. Six server filters — the client's country,
 * governorate and account, and the technician's — default to the header's
 * country and are mirrored in the URL (profiles link here with `?client=` /
 * `?specialist=`). The status filter runs in the browser (see
 * `BookingsStore`). Read-only: the admin can't confirm or cancel bookings.
 */
@Component({
  selector: 'app-bookings-list',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, IconComponent, KpiCardComponent, PaginationComponent, PartyFiltersComponent, BookingsTableComponent, ...FORMAT_PIPES],
  templateUrl: './bookings-list.component.html',
  styleUrl: './bookings-list.component.scss',
})
export class BookingsListComponent {
  private readonly store = inject(BookingsStore);
  private readonly countries = inject(CountriesStore);
  private readonly options = inject(AccountOptionsService);
  private readonly sheet = inject(BookingSheetService);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly parties = new PartyFiltersState();
  protected readonly list = new AccountListController<BookingStatus>(BOOKING_STATUSES, { extraParams: this.parties.params });
  protected readonly pageSizes = ACCOUNT_PAGE_SIZES;

  protected readonly items = this.store.items;
  protected readonly pageMeta = this.store.page;
  protected readonly status = this.store.status;
  protected readonly loadError = this.store.error;
  protected readonly exporting = signal(false);

  /** Skeleton only on a cold load; later queries keep the stale rows (dimmed) until the new page lands. */
  protected readonly firstLoad = computed(() => this.status() !== 'ready' && this.status() !== 'error' && !this.items().length);

  protected readonly hasFilters = computed(() => this.list.status() !== 'all' || this.parties.hasAny());

  protected readonly statusTabs = computed(() => {
    const c = this.store.counts();
    return [
      { id: 'all' as const, label: 'الكل', count: c?.all },
      ...BOOKING_STATUSES.map((s) => ({ id: s, label: BOOKING_STATUS_META[s].label, count: c?.[s] })),
    ];
  });

  protected readonly kpis = computed(() => {
    const c = this.store.counts();
    const all = c?.all ?? 0;
    const share = (n: number) => `${all ? Math.round((n / all) * 100) : 0}% من الإجمالي`;
    // Prices are in the client's country currency — sum them only within one client country.
    const country = this.countries.byId(this.parties.value().client.countryId);
    return {
      all,
      pending: c?.pending ?? 0,
      confirmed: c?.confirmed ?? 0,
      cancelled: c?.cancelled ?? 0,
      // Amounts only within one country — never summed across currencies.
      allHint: country && c ? `قيمة غير الملغاة ${formatNumber(c.value)} ${country.currency}`.trim() : 'لكل الفترات',
      pendingHint: share(c?.pending ?? 0),
      confirmedHint: share(c?.confirmed ?? 0),
      cancelledHint: share(c?.cancelled ?? 0),
    };
  });

  constructor() {
    this.store.expire();

    effect(
      () => {
        const { status, page } = this.list.query();
        const { client, specialist } = this.parties.value();
        const filter = {
          clientId: client.accountId,
          specialistId: specialist.accountId,
          clientLocation: partyLocation(client),
          specialistLocation: partyLocation(specialist),
          status,
        };
        untracked(() => this.store.query(filter, page));
      },
      { allowSignalWrites: true },
    );
  }

  protected reload(): void {
    this.options.invalidate();
    this.store.reload();
  }

  protected goToPage(index: number): void {
    this.list.goToPage(index);
    queueMicrotask(() => document.querySelector('.bk-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  }

  protected setParties(next: PartyFilters): void {
    this.parties.set(next);
  }

  protected open(booking: Booking): void {
    this.sheet.open(booking);
  }

  protected resetFilters(): void {
    this.list.reset();
    this.parties.reset();
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
          const header = [
            'رقم الحجز', 'العميل', 'دولة العميل', 'محافظة العميل', 'الفني', 'دولة الفني', 'محافظة الفني', 'الخدمات',
            'التاريخ', 'المبلغ', 'العملة', 'طريقة الدفع', 'الحالة', 'ملاحظات',
          ];
          downloadCsv(
            'bookings',
            header,
            rows.map((b) => [
              b.id, b.client.name, b.client.place.country?.name ?? '', b.client.place.governorate?.name ?? '',
              b.specialist.name, b.specialist.place.country?.name ?? '', b.specialist.place.governorate?.name ?? '',
              b.items.map((i) => i.name).join('، '), b.date ? formatDate(b.date) : '', b.totalPrice,
              this.countries.currency(b.client.place.country?.id ?? ''),
              b.paymentMethod === 'cash' ? PAYMENT_META.cash.label : b.paymentLabel, BOOKING_STATUS_META[b.status].label, b.notes,
            ]),
          );
          this.toast.success(`تم تصدير ${rows.length} حجز`);
        },
        error: (err: ApiError) => {
          this.exporting.set(false);
          this.toast.error(apiErrorToMessage(err, 'تعذّر تصدير البيانات، حاول مرة أخرى.'));
        },
      });
  }
}
