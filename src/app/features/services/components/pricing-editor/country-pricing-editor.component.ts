import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, input, output, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { IconComponent } from '../../../../shared/components/icon/icon.component';
import { CountriesStore } from '../../../countries/countries.store';
import { CountryFlagComponent } from '../../../countries/country-flag.component';
import { DurationPriceRowComponent } from './duration-price-row.component';
import { GovernoratePickerComponent } from './governorate-picker.component';
import { CountryPricingForm, createDurationPriceForm } from './pricing-forms';

/**
 * One country's offer: which country, in which governorates, and at which
 * durations / price ranges. Picking a country pre-selects all of its
 * governorates (the common case) — the admin narrows it down if needed.
 */
@Component({
  selector: 'app-country-pricing-editor',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, IconComponent, CountryFlagComponent, DurationPriceRowComponent, GovernoratePickerComponent],
  templateUrl: './country-pricing-editor.component.html',
  styleUrl: './country-pricing-editor.component.scss',
})
export class CountryPricingEditorComponent {
  readonly group = input.required<CountryPricingForm>();
  readonly idPrefix = input.required<string>();
  /** Country fixed (adding durations to an already-priced country). */
  readonly lockCountry = input(false);
  /** Countries not offered in the picker (already used elsewhere). */
  readonly excludedCountryIds = input<readonly string[]>([]);
  /** Duration keys ("30", "open") already saved for this country — flagged as duplicates. */
  readonly existingDurations = input<ReadonlySet<string>>(new Set());
  readonly removable = input(false);
  /** `false` when the country already has timed durations saved (so an open-ended row would clash). */
  readonly allowOpen = input(true);
  readonly disabled = input(false);
  /** Block-level error from the parent (e.g. country used twice). */
  readonly blockError = input<string | null>(null);
  readonly remove = output<void>();

  private readonly fb = inject(NonNullableFormBuilder);
  private readonly countriesStore = inject(CountriesStore);
  private readonly tick = signal(0);

  protected readonly countryId = computed(() => {
    this.tick();
    return this.group().controls.countryId.value;
  });
  protected readonly country = computed(() => this.countriesStore.byId(this.countryId()));
  protected readonly currency = computed(() => this.country()?.currency ?? '');
  protected readonly divisionPlural = computed(() => this.country()?.division.plural ?? 'المحافظات');
  protected readonly countryOptions = computed(() => {
    const excluded = new Set(this.excludedCountryIds());
    const current = this.countryId();
    return this.countriesStore.all().filter((c) => c.id === current || !excluded.has(c.id));
  });
  /**
   * A fresh copy per form event: `FormArray.controls` is mutated in place, so
   * returning it directly would look "unchanged" to every dependent computed.
   */
  protected readonly prices = computed(() => {
    this.tick();
    return [...this.group().controls.prices.controls];
  });

  constructor() {
    let events: Subscription | null = null;
    let countryChanges: Subscription | null = null;
    effect(
      () => {
        const g = this.group();
        events?.unsubscribe();
        countryChanges?.unsubscribe();
        events = g.events.subscribe(() => this.tick.update((n) => n + 1));
        // A newly picked country starts with all its governorates selected.
        countryChanges = g.controls.countryId.valueChanges.subscribe((id) => {
          const all = this.countriesStore.byId(id)?.governorates.map((x) => x.id) ?? [];
          g.controls.governorateIds.setValue(all);
          g.controls.governorateIds.markAsPristine();
        });
        this.tick.update((n) => n + 1);
      },
      { allowSignalWrites: true },
    );
    inject(DestroyRef).onDestroy(() => {
      events?.unsubscribe();
      countryChanges?.unsubscribe();
    });
  }

  /** An open-ended row makes this country's pricing a single price range (other countries are unaffected). */
  protected readonly hasOpen = computed(() => this.prices().some((p) => !p.controls.hasDuration.value));
  protected readonly addDurationHint = computed(() =>
    this.hasOpen() ? 'الجلسة المفتوحة لها نطاق سعر واحد في هذه الدولة — اختر «مدة محددة» لإضافة مدد' : null,
  );
  /** Only a lone row may switch to open-ended. */
  protected readonly rowAllowOpen = computed(() => this.allowOpen() && this.prices().length === 1);
  protected readonly openHint = computed(() =>
    this.allowOpen()
      ? 'الجلسة المفتوحة تكون السعر الوحيد للدولة — احذف المدد الأخرى أولًا'
      : 'هذه الدولة لها مدد محددة بالفعل، والجلسة المفتوحة لا تجتمع معها',
  );

  protected rowError(index: number): string | null {
    this.tick();
    const prices = this.group().controls.prices;
    const dupes: number[] = prices.errors?.['duplicateDurations'] ?? [];
    if (dupes.includes(index)) return 'هذه المدة مكررة داخل نفس الدولة';
    const { hasDuration, durationMin } = prices.at(index).getRawValue();
    const key = hasDuration ? (durationMin ? String(durationMin) : null) : 'open';
    if (key && this.existingDurations().has(key)) return 'هذه المدة مسجّلة بالفعل لهذه الدولة — عدّلها من القائمة';
    return null;
  }

  protected countryError(): boolean {
    this.tick();
    const c = this.group().controls.countryId;
    return c.invalid && c.touched;
  }

  protected governoratesError(): boolean {
    this.tick();
    const c = this.group().controls.governorateIds;
    return c.invalid && c.touched;
  }

  protected addDuration(): void {
    if (this.hasOpen()) return;
    this.group().controls.prices.push(createDurationPriceForm(this.fb));
  }

  protected removeDuration(index: number): void {
    this.group().controls.prices.removeAt(index);
  }
}
