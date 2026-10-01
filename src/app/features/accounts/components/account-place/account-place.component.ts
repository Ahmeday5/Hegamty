import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { CountryFlagComponent } from '../../../countries/country-flag.component';
import { AccountPlace } from '../../account-profile';

/**
 * Country flag + name with the governorate underneath — the location cell
 * of the accounts lists and detail pages.
 *
 *   <app-account-place [place]="c.place" />
 */
@Component({
  selector: 'app-account-place',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CountryFlagComponent],
  template: `
    @if (place().country || place().governorate) {
      <span class="place">
        <app-country-flag [countryId]="place().country?.id" [name]="place().country?.name ?? ''" [size]="size()" />
        <span class="place__txt">
          <strong>{{ place().country?.name || '—' }}</strong>
          @if (place().governorate; as g) { <span>{{ g.name }}</span> }
        </span>
      </span>
    } @else {
      <span class="place__none">—</span>
    }
  `,
  styles: [`
    :host { display: inline-block; min-width: 0; }
    .place { display: inline-flex; align-items: center; gap: 8px; min-width: 0; }
    .place__txt { display: grid; gap: 2px; min-width: 0; line-height: 1.35; }
    .place__txt strong { font-weight: 600; color: var(--black); white-space: nowrap; }
    .place__txt span { font-size: 12px; color: var(--txt3); white-space: nowrap; }
    .place__none { color: var(--txt3); }
  `],
})
export class AccountPlaceComponent {
  readonly place = input.required<AccountPlace>();
  /** Flag width in px. */
  readonly size = input(20);
}
