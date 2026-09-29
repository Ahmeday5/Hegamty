import { ChangeDetectionStrategy, Component, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
import { ModalComponent } from '../../../../shared/components/modal/modal.component';
import { IconComponent } from '../../../../shared/components/icon/icon.component';
import { foldText } from '../../../../shared/utils/text-normalize.util';
import { CountriesStore } from '../../../countries/countries.store';
import { CountryFlagComponent } from '../../../countries/country-flag.component';
import { DivisionCountPipe } from '../../../countries/country.pipes';
import { formatCountries } from '../../service-catalog.pipes';
import { ServiceCategory } from '../../services.models';
import { SectionIconComponent } from '../section-icon/section-icon.component';

/** Show the search box once the list is long enough to need it. */
const SEARCH_THRESHOLD = 6;

/**
 * Every country a section is offered in — flag, names, currency and how
 * many governorates it has — with search, and a shortcut to edit the list.
 */
@Component({
  selector: 'app-section-countries-dialog',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ModalComponent, IconComponent, CountryFlagComponent, SectionIconComponent, DivisionCountPipe],
  templateUrl: './section-countries-dialog.component.html',
  styleUrl: './section-countries-dialog.component.scss',
})
export class SectionCountriesDialogComponent {
  readonly open = input.required<boolean>();
  readonly section = input<ServiceCategory | null>(null);
  /** The header's country scope — highlighted in the list. */
  readonly focusCountryId = input<string | null>(null);
  readonly closed = output<void>();
  readonly edit = output<ServiceCategory>();

  private readonly countriesStore = inject(CountriesStore);

  protected readonly query = signal('');
  protected readonly searchThreshold = SEARCH_THRESHOLD;

  /** Section's countries enriched from the catalog (currency, flag, divisions); unknown ids still listed. */
  protected readonly rows = computed(() =>
    (this.section()?.countries ?? []).map((c) => {
      const full = this.countriesStore.byId(c.id);
      return {
        id: c.id,
        name: c.name || full?.name || '',
        nameEn: c.nameEn || full?.nameEn || '',
        currency: full?.currency ?? '',
        divisions: full?.governorates.length ?? 0,
        division: full?.division ?? null,
      };
    }),
  );

  protected readonly filtered = computed(() => {
    const q = foldText(this.query());
    const list = this.rows();
    const focus = this.focusCountryId();
    const matched = q ? list.filter((r) => foldText(r.name).includes(q) || foldText(r.nameEn).includes(q)) : list;
    // The scoped country first, then the section's own (alphabetical) order.
    return focus ? [...matched.filter((r) => r.id === focus), ...matched.filter((r) => r.id !== focus)] : matched;
  });

  protected readonly countLabel = computed(() => formatCountries(this.rows().length));
  protected readonly coverageRatio = computed(() => {
    const total = this.countriesStore.all().length;
    return total ? Math.round((this.rows().length / total) * 100) : 0;
  });

  constructor() {
    effect(
      () => {
        if (!this.open()) return;
        this.section();
        untracked(() => this.query.set(''));
      },
      { allowSignalWrites: true },
    );
  }

  protected onEdit(): void {
    const s = this.section();
    if (s) this.edit.emit(s);
  }
}
