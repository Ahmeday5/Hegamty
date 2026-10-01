import { ChangeDetectionStrategy, Component, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IconComponent } from '../../../../shared/components/icon/icon.component';
import { PaginationComponent } from '../../../../shared/components/pagination/pagination.component';
import { FORMAT_PIPES } from '../../../../shared/pipes/format.pipes';
import { RecordState } from '../../../../core/utils/record-loader';
import { pageOf } from '../../../../core/models/page.model';
import { BOOKING_STATUSES, BOOKING_STATUS_META, Booking, BookingStatus, countBookings } from '../../bookings.models';
import { BookingsTableComponent, BookingsTableParty } from '../bookings-table/bookings-table.component';
import { BookingSheetService } from '../../booking-sheet.service';
import { accountFilterParams } from '../../../accounts/party-filters';

const PAGE_SIZES = [10, 25, 50] as const;

/**
 * An account's bookings on its profile: status tabs with totals, local
 * paging and the booking sheet. The caller loads the account's bookings
 * (all of them — the status filter is applied here).
 */
@Component({
  selector: 'app-account-bookings',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, IconComponent, PaginationComponent, BookingsTableComponent, ...FORMAT_PIPES],
  template: `
    <div class="panel">
      <div class="panel__head">
        <div>
          <h3 class="panel__title">الحجوزات</h3>
          <p class="panel__sub">{{ party() === 'client' ? 'الحجوزات التي طلبها العميل من التطبيق' : 'الحجوزات المسندة إلى الفني' }}</p>
        </div>
        @if (bookings()?.length) {
          <a class="btn btn-soft btn-sm" routerLink="/bookings" [queryParams]="pageLink()">
            صفحة الحجوزات <app-icon name="chevron-left" [size]="15" />
          </a>
        }
      </div>

      @if (state() === 'error') {
        <div class="empty">
          <span class="empty__icon empty__icon--red"><app-icon name="alert" [size]="24" /></span>
          <p class="empty__title">تعذّر تحميل الحجوزات</p>
          <p class="empty__text">{{ error() }}</p>
          <button type="button" class="btn btn-soft btn-sm" (click)="retry.emit()"><app-icon name="refresh" [size]="14" /> إعادة المحاولة</button>
        </div>
      } @else {
        @if (bookings()?.length) {
          <div class="ab-bar">
            <div class="seg" role="tablist" aria-label="حالة الحجز">
              @for (t of tabs(); track t.id) {
                <button type="button" class="seg__btn" role="tab" [class.is-on]="status() === t.id" [attr.aria-selected]="status() === t.id"
                  (click)="setStatus(t.id)">
                  {{ t.label }} <span class="seg__count">{{ t.count | num }}</span>
                </button>
              }
            </div>
          </div>
        }

        <app-bookings-table [rows]="page().items" [hide]="party()" [loading]="state() === 'loading'"
          [emptyTitle]="status() === 'all' ? 'لا توجد حجوزات بعد' : 'لا توجد حجوزات بهذه الحالة'"
          [emptyText]="status() === 'all' ? emptyText() : ''" (open)="sheet.open($event)" />

        @if (page().page.count > page().page.pageSize) {
          <div class="table-foot">
            <app-pagination [pageIndex]="page().page.pageIndex" [pageSize]="page().page.pageSize" [count]="page().page.count"
              [totalPages]="page().page.totalPages" [pageSizeOptions]="pageSizes" (pageChange)="pageIndex.set($event)"
              (pageSizeChange)="changePageSize($event)" />
          </div>
        }
      }
    </div>
  `,
  styles: [`
    :host { display: block; }
    .ab-bar { padding: 12px 20px; border-bottom: 1px solid var(--brd); }
    .ab-bar .seg { max-width: 100%; overflow-x: auto; }
    .empty__icon--red { background: var(--re-l); color: var(--re); }
  `],
})
export class AccountBookingsComponent {
  readonly bookings = input<Booking[] | null>(null);
  readonly state = input.required<RecordState>();
  readonly error = input<string | null>(null);
  /** Whose profile this is — that party's column is left out. */
  readonly party = input.required<BookingsTableParty>();
  readonly ownerId = input.required<string>();
  /** The owner's country (residence / work area) — lets the bookings page pre-select it. */
  readonly ownerCountryId = input<string | null>(null);
  readonly retry = output<void>();

  protected readonly pageSizes = PAGE_SIZES;
  protected readonly status = signal<BookingStatus | 'all'>('all');
  protected readonly pageIndex = signal(1);
  protected readonly pageSize = signal<number>(PAGE_SIZES[0]);
  protected readonly sheet = inject(BookingSheetService);
  protected readonly pageLink = computed(() => accountFilterParams(this.party(), this.ownerId(), this.ownerCountryId()));

  protected readonly emptyText = computed(() =>
    this.party() === 'client' ? 'تظهر هنا الحجوزات التي يطلبها العميل من التطبيق.' : 'تظهر هنا الحجوزات التي يستقبلها الفني من العملاء.',
  );

  protected readonly tabs = computed(() => {
    const c = countBookings(this.bookings() ?? []);
    return [
      { id: 'all' as const, label: 'الكل', count: c.all },
      ...BOOKING_STATUSES.map((s) => ({ id: s, label: BOOKING_STATUS_META[s].label, count: c[s] })),
    ];
  });

  protected readonly page = computed(() => {
    const status = this.status();
    const rows = (this.bookings() ?? []).filter((b) => status === 'all' || b.status === status);
    const size = this.pageSize();
    const last = Math.max(1, Math.ceil(rows.length / size));
    return pageOf(rows, { pageIndex: Math.min(this.pageIndex(), last), pageSize: size });
  });

  constructor() {
    // Another account (or a reload) starts back at the first page.
    effect(
      () => {
        this.bookings();
        untracked(() => this.pageIndex.set(1));
      },
      { allowSignalWrites: true },
    );
  }

  protected setStatus(status: BookingStatus | 'all'): void {
    this.status.set(status);
    this.pageIndex.set(1);
  }

  protected changePageSize(size: number): void {
    this.pageSize.set(size);
    this.pageIndex.set(1);
  }
}
