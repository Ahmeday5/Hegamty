import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { IconComponent } from '../../../../shared/components/icon/icon.component';
import { RecordState } from '../../../../core/utils/record-loader';
import { formatGeoPoint, mapsUrl } from '../../../accounts/account-profile';
import { ClientAddress } from '../../clients.models';

/** Addresses a customer saved in the app, as cards with a map link — plus their loading / error / empty states. */
@Component({
  selector: 'app-client-addresses',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent],
  templateUrl: './client-addresses.component.html',
  styleUrl: './client-addresses.component.scss',
})
export class ClientAddressesComponent {
  readonly addresses = input<ClientAddress[] | null>(null);
  readonly state = input.required<RecordState>();
  readonly error = input<string | null>(null);
  readonly retry = output<void>();

  protected readonly mapsUrl = mapsUrl;
  protected readonly formatGeoPoint = formatGeoPoint;
}
