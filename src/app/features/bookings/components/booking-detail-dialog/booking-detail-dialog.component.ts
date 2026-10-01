import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, input, output, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IconComponent } from '../../../../shared/components/icon/icon.component';
import { AvatarComponent } from '../../../../shared/components/avatar/avatar.component';
import { ModalComponent } from '../../../../shared/components/modal/modal.component';
import { DevBadgeComponent } from '../../../../shared/components/dev-status/dev-badge.component';
import { FORMAT_PIPES } from '../../../../shared/pipes/format.pipes';
import { RecordLoader } from '../../../../core/utils/record-loader';
import { COUNTRY_PIPES } from '../../../countries/country.pipes';
import { AccountPlaceComponent } from '../../../accounts/components/account-place/account-place.component';
import { formatGeoPoint, mapsUrl } from '../../../accounts/account-profile';
import { ClientsApi } from '../../../clients/clients.api';
import { ClientAddress } from '../../../clients/clients.models';
import { BOOKING_STATUS_META, Booking, PAYMENT_META } from '../../bookings.models';

/**
 * Read-only booking sheet: services and prices, payment, notes, the parties
 * and the session address. There's no single-booking endpoint, so the
 * booking comes from the list that opened it; the address is resolved from
 * the client's saved addresses (`addressId`).
 */
@Component({
  selector: 'app-booking-detail-dialog',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, IconComponent, AvatarComponent, ModalComponent, DevBadgeComponent, AccountPlaceComponent, ...FORMAT_PIPES, ...COUNTRY_PIPES],
  templateUrl: './booking-detail-dialog.component.html',
  styleUrl: './booking-detail-dialog.component.scss',
})
export class BookingDetailDialogComponent {
  /** The booking to show; `null` = closed. */
  readonly booking = input<Booking | null>(null);
  readonly closed = output<void>();

  private readonly clients = inject(ClientsApi);

  protected readonly statusMeta = BOOKING_STATUS_META;
  protected readonly paymentMeta = PAYMENT_META;
  protected readonly mapsUrl = mapsUrl;
  protected readonly formatGeoPoint = formatGeoPoint;

  protected readonly addresses = new RecordLoader<ClientAddress[]>((clientId) => this.clients.addresses(clientId), {
    destroyRef: inject(DestroyRef),
    errorMessage: 'تعذّر تحميل عنوان الحجز',
  });

  protected readonly address = computed(() => {
    const id = this.booking()?.addressId;
    return id ? (this.addresses.value()?.find((a) => a.id === id) ?? null) : null;
  });

  /** Country id the amounts are priced in (the client's). */
  protected readonly currencyOf = computed(() => this.booking()?.client.place.country?.id ?? '');

  private lastClientId: string | null = null;

  constructor() {
    // Addresses are per client — refetch only when the booking belongs to someone else.
    effect(
      () => {
        const b = this.booking();
        if (!b?.addressId || b.client.id === this.lastClientId) return;
        this.lastClientId = b.client.id;
        untracked(() => this.addresses.load(b.client.id));
      },
      { allowSignalWrites: true },
    );
  }
}
