import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormArray, NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ModalComponent } from '../../../../shared/components/modal/modal.component';
import { FormErrorComponent } from '../../../../shared/components/form-error/form-error.component';
import { IconComponent } from '../../../../shared/components/icon/icon.component';
import { ToastService } from '../../../../core/services/toast.service';
import { ApiError } from '../../../../core/models/api-response.model';
import { apiErrorToMessage } from '../../../../core/utils/api-error.util';
import { CategoriesStore } from '../../categories.store';
import { CountriesStore } from '../../../countries/countries.store';
import { ServiceCatalogStore } from '../../service-catalog.store';
import { CatalogService, CatalogServiceUpdate } from '../../service-catalog.models';
import { CountryPricingEditorComponent } from '../pricing-editor/country-pricing-editor.component';
import {
  CountryPricingForm,
  createCountryPricingForm,
  createCountryPricingFormFor,
  readCountryPricing,
  revealErrors,
  uniqueCountriesValidator,
} from '../pricing-editor/pricing-forms';

const NAME_MAX = 100;
const DESC_MAX = 500;

/**
 * Create a service with its first countries (each with governorates and one
 * or more durations), or edit its own fields. On edit, pricing lives in the
 * pricing dialog, which has its own endpoints.
 */
@Component({
  selector: 'app-service-form',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, ModalComponent, FormErrorComponent, IconComponent, CountryPricingEditorComponent],
  templateUrl: './service-form.component.html',
  styleUrl: './service-form.component.scss',
})
export class ServiceFormComponent {
  readonly open = input.required<boolean>();
  readonly service = input<CatalogService | null>(null);
  /** Pre-selected section for a new service (the page's section filter). */
  readonly sectionId = input<string | null>(null);
  /** Pre-selected country for the first pricing (the header's country scope). */
  readonly countryId = input<string | null>(null);
  readonly closed = output<void>();
  readonly managePricing = output<CatalogService>();

  private readonly fb = inject(NonNullableFormBuilder);
  private readonly store = inject(ServiceCatalogStore);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);

  private readonly sectionsStore = inject(CategoriesStore);
  private readonly countriesStore = inject(CountriesStore);
  protected readonly sections = this.sectionsStore.all;
  protected readonly nameMax = NAME_MAX;
  protected readonly descMax = DESC_MAX;
  protected readonly saving = signal(false);
  protected readonly serverError = signal<string | null>(null);
  protected readonly submitted = signal(false);

  protected readonly pricings = new FormArray<CountryPricingForm>([], { validators: uniqueCountriesValidator });
  protected readonly form = this.fb.group({
    sectionId: ['', Validators.required],
    name: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(NAME_MAX)]],
    description: ['', Validators.maxLength(DESC_MAX)],
    active: [true],
  });

  private readonly value = toSignal(this.form.valueChanges, { initialValue: this.form.getRawValue() });
  private readonly pricingsState = toSignal(this.pricings.events, { initialValue: null });

  protected readonly isEdit = computed(() => !!this.service());
  protected readonly title = computed(() => (this.service() ? `تعديل "${this.service()!.name}"` : 'إضافة خدمة جديدة'));
  protected readonly descLength = computed(() => this.value().description?.length ?? 0);
  protected readonly active = computed(() => this.value().active ?? true);

  /** Block indexes whose country is already used by an earlier block. */
  protected readonly duplicateBlocks = computed(() => {
    this.pricingsState();
    const dups: number[] = this.pricings.errors?.['duplicateCountries'] ?? [];
    return new Set(dups);
  });

  /** Countries picked in blocks other than `index` — hidden from that block's picker. */
  protected usedCountriesExcept(index: number): string[] {
    this.pricingsState();
    return this.pricings.controls.filter((_, i) => i !== index).map((b) => b.controls.countryId.value).filter(Boolean);
  }

  protected readonly canAddCountry = computed(() => {
    this.pricingsState();
    return this.pricings.length < this.countriesStore.all().length;
  });
  protected readonly noPricings = computed(() => {
    this.pricingsState();
    return this.submitted() && this.pricings.length === 0;
  });

  /**
   * Countries this service is (or will be) priced in where the chosen section
   * isn't offered — the service wouldn't be reachable there in the app.
   */
  protected readonly sectionGaps = computed(() => {
    this.pricingsState();
    const section = this.sectionsStore.byId(this.value().sectionId);
    if (!section) return [];
    const priced = this.service()
      ? this.service()!.pricings.map((p) => p.countryId)
      : this.pricings.controls.map((row) => row.controls.countryId.value).filter(Boolean);
    const offered = new Set(section.countries.map((c) => c.id));
    return [...new Set(priced)].filter((id) => !offered.has(id)).map((id) => this.countriesStore.byId(id)?.name ?? id);
  });

  constructor() {
    effect(
      () => {
        if (!this.open()) return;
        const s = this.service();
        const sectionId = this.sectionId();
        const countryId = this.countryId();
        untracked(() => this.reset(s, sectionId, countryId));
      },
      { allowSignalWrites: true },
    );
  }

  protected invalid(name: 'sectionId' | 'name' | 'description'): boolean {
    const c = this.form.controls[name];
    return c.invalid && c.touched;
  }

  protected addCountry(): void {
    // New countries usually sell the same session lengths — carry the previous block's durations over, prices blank.
    const last = this.pricings.at(this.pricings.length - 1);
    const durations = last?.controls.prices.controls.map((p) => ({
      durationMin: p.controls.hasDuration.value ? p.controls.durationMin.value : null,
    }));
    this.pricings.push(createCountryPricingForm(this.fb, { prices: durations }));
  }

  protected removePricing(index: number): void {
    this.pricings.removeAt(index);
  }

  protected toggleActive(): void {
    this.form.controls.active.setValue(!this.form.controls.active.value);
  }

  protected openPricing(): void {
    const s = this.service();
    if (s) this.managePricing.emit(s);
  }

  protected close(): void {
    if (!this.saving()) this.closed.emit();
  }

  protected submit(): void {
    if (this.saving()) return;
    this.submitted.set(true);
    this.serverError.set(null);
    const existing = this.service();
    const pricingsInvalid = !existing && (this.pricings.invalid || this.pricings.length === 0);

    if (this.form.invalid || pricingsInvalid) {
      this.form.markAllAsTouched();
      revealErrors(this.pricings);
      return;
    }

    const v = this.form.getRawValue();
    const fields: CatalogServiceUpdate = {
      sectionId: v.sectionId,
      name: v.name.trim(),
      description: v.description.trim(),
      active: v.active,
    };

    this.saving.set(true);
    if (existing) {
      this.store
        .update(existing.id, fields)
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: (s) => this.done(`تم تحديث خدمة "${s.name}"`),
          error: (err: ApiError) => this.fail(err, 'تعذّر حفظ التعديلات'),
        });
      return;
    }

    this.store
      .create({ ...fields, pricings: this.pricings.controls.map(readCountryPricing) })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (service) => this.done(`تمت إضافة خدمة "${service.name}"`),
        error: (err: ApiError) => this.fail(err, 'تعذّرت إضافة الخدمة'),
      });
  }

  private done(message: string): void {
    this.saving.set(false);
    this.toast.success(message);
    this.closed.emit();
  }

  private fail(err: ApiError, fallback: string): void {
    this.saving.set(false);
    this.serverError.set(apiErrorToMessage(err, fallback));
  }

  private reset(s: CatalogService | null, sectionId: string | null, countryId: string | null): void {
    this.saving.set(false);
    this.submitted.set(false);
    this.serverError.set(null);
    this.form.reset({
      sectionId: s?.sectionId ?? sectionId ?? this.sections()[0]?.id ?? '',
      name: s?.name ?? '',
      description: s?.description ?? '',
      active: s?.active ?? true,
    });
    this.pricings.clear();
    if (!s) this.pricings.push(createCountryPricingFormFor(this.fb, this.countriesStore.byId(countryId)));
  }
}
