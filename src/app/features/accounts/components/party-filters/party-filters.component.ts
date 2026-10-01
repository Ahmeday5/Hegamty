import { ChangeDetectionStrategy, Component, inject, input, output } from '@angular/core';
import { IconComponent, IconName } from '../../../../shared/components/icon/icon.component';
import { CountriesStore } from '../../../countries/countries.store';
import { CountryFlagComponent } from '../../../countries/country-flag.component';
import { AccountKind } from '../../account-options.service';
import { PartyFilter, PartyFilters, partyLocation } from '../../party-filters';
import { AccountPickerComponent } from '../account-picker/account-picker.component';

const SIDES: { kind: AccountKind; label: string; icon: IconName; account: string }[] = [
  { kind: 'client', label: 'العميل', icon: 'user', account: 'العميل' },
  { kind: 'specialist', label: 'الفني', icon: 'stethoscope', account: 'الفني' },
];

/**
 * Client and technician filters, one row each: country → governorate →
 * account. Changing a level clears the levels below it (they depend on it).
 */
@Component({
  selector: 'app-party-filters',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent, CountryFlagComponent, AccountPickerComponent],
  template: `
    <div class="pf" role="group" aria-label="فلترة حسب العميل والفني">
      @for (side of sides; track side.kind) {
        @let f = value()[side.kind];
        @let country = countries.byId(f.countryId);
        <div class="pf__row">
          <span class="pf__label"><app-icon [name]="side.icon" [size]="15" /> {{ side.label }}</span>

          <span class="pf__field pf__field--country">
            @if (country) { <app-country-flag class="pf__flag" [countryId]="country.id" [size]="18" /> }
            <!-- Options render after the <select>, so selection is bound per option (a [value] on the select would be lost). -->
            <select class="form-select select-sm" [class.has-flag]="!!country" [attr.aria-label]="'دولة ' + side.label"
              (change)="setCountry(side.kind, $any($event.target).value)">
              <option value="" [selected]="!f.countryId">كل الدول</option>
              @for (c of countries.all(); track c.id) {
                <option [value]="c.id" [selected]="c.id === f.countryId">{{ c.name }}</option>
              }
            </select>
          </span>

          <select class="form-select select-sm pf__field" [attr.aria-label]="(country?.division?.plural ?? 'المحافظات') + ' — ' + side.label"
            [disabled]="!country?.governorates?.length" (change)="setGovernorate(side.kind, $any($event.target).value)">
            <option value="" [selected]="!f.governorateId">
              {{ country ? 'كل ال' + country.division.plural : 'اختر الدولة أولًا' }}
            </option>
            @for (g of country?.governorates ?? []; track g.id) {
              <option [value]="g.id" [selected]="g.id === f.governorateId">{{ g.name }}</option>
            }
          </select>

          <app-account-picker class="pf__field pf__field--account" [kind]="side.kind" [location]="location(f)" [value]="f.accountId"
            [ariaLabel]="side.account" (valueChange)="setAccount(side.kind, $event)" />
        </div>
      }
    </div>
  `,
  styles: [`
    :host { display: block; }
    .pf { display: grid; gap: 8px; }
    .pf__row {
      display: grid;
      grid-template-columns: 74px minmax(150px, 1fr) minmax(150px, 1fr) minmax(200px, 1.4fr);
      align-items: center;
      gap: 8px;
    }
    .pf__label { display: inline-flex; align-items: center; gap: 6px; font-size: 12.5px; font-weight: 600; color: var(--txt2); white-space: nowrap; }
    .pf__label app-icon { color: var(--pr); }
    .pf__field { min-width: 0; width: 100%; }
    .pf__field--country { position: relative; display: block; }
    .pf__field--country select { width: 100%; }
    .pf__flag { position: absolute; inset-inline-start: 10px; top: 50%; translate: 0 -50%; pointer-events: none; z-index: 1; }
    select.has-flag { padding-inline-start: 36px; }
    @media (max-width: 991.98px) {
      .pf__row { grid-template-columns: 1fr 1fr; }
      .pf__label { grid-column: 1 / -1; }
      .pf__field--account { grid-column: 1 / -1; }
    }
  `],
})
export class PartyFiltersComponent {
  readonly value = input.required<PartyFilters>();
  readonly filtersChange = output<PartyFilters>();

  protected readonly countries = inject(CountriesStore);
  protected readonly sides = SIDES;
  protected readonly location = partyLocation;

  protected setCountry(kind: AccountKind, id: string): void {
    this.patch(kind, { countryId: id || null, governorateId: null, accountId: null });
  }

  protected setGovernorate(kind: AccountKind, id: string): void {
    this.patch(kind, { governorateId: id || null, accountId: null });
  }

  protected setAccount(kind: AccountKind, id: string | null): void {
    this.patch(kind, { accountId: id });
  }

  private patch(kind: AccountKind, change: Partial<PartyFilter>): void {
    const current = this.value();
    this.filtersChange.emit({ ...current, [kind]: { ...current[kind], ...change } });
  }
}
