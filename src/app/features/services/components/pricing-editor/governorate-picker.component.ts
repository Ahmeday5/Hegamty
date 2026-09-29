import { ChangeDetectionStrategy, Component, computed, forwardRef, inject, input, signal } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { IconComponent } from '../../../../shared/components/icon/icon.component';
import { foldText } from '../../../../shared/utils/text-normalize.util';
import { CountriesStore } from '../../../countries/countries.store';
import { coverageLabel, coversAll } from './coverage';

/** Show the search box once a country has this many governorates. */
const SEARCH_THRESHOLD = 10;

/**
 * Chooses the governorates (regions / states …) of one country a pricing
 * applies to. Collapsed it's a one-line summary ("كل المحافظات"); expanded
 * it's a searchable chip grid with select-all. Wording follows the country.
 *
 *   <app-governorate-picker formControlName="governorateIds" [countryId]="countryId" />
 */
@Component({
  selector: 'app-governorate-picker',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent],
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => GovernoratePickerComponent), multi: true }],
  templateUrl: './governorate-picker.component.html',
  styleUrl: './governorate-picker.component.scss',
})
export class GovernoratePickerComponent implements ControlValueAccessor {
  readonly countryId = input<string | null>(null);
  readonly invalid = input(false);
  /** Start expanded (e.g. when editing a row whose coverage is partial). */
  readonly startOpen = input(false);

  private readonly countries = inject(CountriesStore);

  protected readonly value = signal<string[]>([]);
  protected readonly disabled = signal(false);
  protected readonly expanded = signal<boolean | null>(null);
  protected readonly query = signal('');
  protected readonly searchThreshold = SEARCH_THRESHOLD;

  protected readonly country = computed(() => this.countries.byId(this.countryId()));
  protected readonly options = computed(() => this.country()?.governorates ?? []);
  protected readonly selected = computed(() => new Set(this.value()));
  protected readonly isOpen = computed(() => this.expanded() ?? this.startOpen());
  protected readonly allSelected = computed(() => coversAll(this.value().length, this.country()));
  protected readonly summary = computed(() => coverageLabel(this.value().length, this.country()));
  protected readonly plural = computed(() => this.country()?.division.plural ?? 'المحافظات');
  protected readonly singular = computed(() => this.country()?.division.singular ?? 'محافظة');
  protected readonly filtered = computed(() => {
    const q = foldText(this.query());
    const list = this.options();
    return q ? list.filter((g) => foldText(g.name).includes(q) || foldText(g.nameEn).includes(q)) : list;
  });

  private onChange: (v: string[]) => void = () => undefined;
  private onTouched: () => void = () => undefined;

  // ── ControlValueAccessor ──

  writeValue(value: string[] | null): void {
    this.value.set(Array.isArray(value) ? [...value] : []);
  }

  registerOnChange(fn: (v: string[]) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(disabled: boolean): void {
    this.disabled.set(disabled);
  }

  // ── interactions ──

  protected toggleOpen(): void {
    this.expanded.set(!this.isOpen());
    this.onTouched();
  }

  protected toggle(id: string): void {
    const next = this.selected().has(id) ? this.value().filter((x) => x !== id) : [...this.value(), id];
    this.emit(next);
  }

  protected selectAll(): void {
    this.emit(this.options().map((g) => g.id));
  }

  protected clear(): void {
    this.emit([]);
  }

  private emit(ids: string[]): void {
    this.value.set(ids);
    this.onChange(ids);
    this.onTouched();
  }
}
