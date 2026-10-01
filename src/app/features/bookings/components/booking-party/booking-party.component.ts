import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { AvatarComponent } from '../../../../shared/components/avatar/avatar.component';
import { CountryFlagComponent } from '../../../countries/country-flag.component';
import { AccountRef } from '../../../accounts/account-profile';

/** A booking party in a table cell: avatar, name, then flag · country · governorate. */
@Component({
  selector: 'app-booking-party',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AvatarComponent, CountryFlagComponent],
  template: `
    <div class="who">
      <app-avatar [name]="party().name" [size]="32" />
      <div class="who__txt">
        <strong>{{ party().name }}</strong>
        @if (party().place; as place) {
          @if (place.country || place.governorate) {
            <span class="who__place">
              @if (place.country; as c) { <app-country-flag [countryId]="c.id" [name]="c.name" [size]="14" /> {{ c.name }} }
              @if (place.country && place.governorate) { <span class="who__dot" aria-hidden="true">·</span> }
              @if (place.governorate; as g) { {{ g.name }} }
            </span>
          } @else {
            <span class="who__place">—</span>
          }
        }
      </div>
    </div>
  `,
  styles: [`
    :host { display: block; }
    .who { display: flex; align-items: center; gap: 10px; }
    .who__txt { display: grid; gap: 2px; min-width: 0; }
    .who__txt strong { font-weight: 600; color: var(--black); white-space: nowrap; }
    .who__place { display: inline-flex; align-items: center; gap: 5px; font-size: 12px; color: var(--txt3); white-space: nowrap; }
    .who__dot { opacity: 0.6; }
  `],
})
export class BookingPartyComponent {
  readonly party = input.required<AccountRef>();
}
