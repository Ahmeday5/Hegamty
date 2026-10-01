import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { BookingPartyComponent } from '../booking-party/booking-party.component';
import { IconComponent } from '../../../../shared/components/icon/icon.component';
import { DevBadgeComponent } from '../../../../shared/components/dev-status/dev-badge.component';
import { FORMAT_PIPES } from '../../../../shared/pipes/format.pipes';
import { COUNTRY_PIPES } from '../../../countries/country.pipes';
import { BOOKING_STATUS_META, Booking, PAYMENT_META, itemsSummary } from '../../bookings.models';

/** Which party column to leave out — on a profile, the owner is implied. */
export type BookingsTableParty = 'client' | 'specialist';

/**
 * Bookings as table rows (presentational). Paging, filtering and error
 * states belong to the caller; a row click asks the caller to open it.
 */
@Component({
  selector: 'app-bookings-table',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent, DevBadgeComponent, BookingPartyComponent, ...FORMAT_PIPES, ...COUNTRY_PIPES],
  templateUrl: './bookings-table.component.html',
  styleUrl: './bookings-table.component.scss',
})
export class BookingsTableComponent {
  readonly rows = input.required<Booking[]>();
  readonly hide = input<BookingsTableParty | null>(null);
  /** Skeleton rows while nothing is loaded yet. */
  readonly loading = input(false);
  /** Dims the current rows while a newer page loads. */
  readonly stale = input(false);
  readonly emptyTitle = input('لا توجد حجوزات');
  readonly emptyText = input('');
  readonly open = output<Booking>();

  protected readonly statusMeta = BOOKING_STATUS_META;
  protected readonly paymentMeta = PAYMENT_META;
  protected readonly itemsSummary = itemsSummary;
  protected readonly skeletonRows = Array.from({ length: 6 }, (_, i) => i);

  protected readonly columns = computed(() => 8 - (this.hide() ? 1 : 0));
  protected readonly skeletonCells = computed(() => Array.from({ length: this.columns() - 1 }, (_, i) => i));
}
