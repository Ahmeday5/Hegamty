import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  WritableSignal,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
import { Observable } from 'rxjs';
import { ModalComponent } from '../../../../shared/components/modal/modal.component';
import { IconComponent } from '../../../../shared/components/icon/icon.component';
import { DialogService } from '../../../../core/services/dialog.service';
import { ToastService } from '../../../../core/services/toast.service';
import { ApiError } from '../../../../core/models/api-response.model';
import { apiErrorToMessage } from '../../../../core/utils/api-error.util';
import { CountriesStore } from '../../../countries/countries.store';
import { CountryFlagComponent } from '../../../countries/country-flag.component';
import { ServiceCatalogStore } from '../../service-catalog.store';
import { CatalogService, ServicePricing, durationKey } from '../../service-catalog.models';
import { CATALOG_PIPES, formatDuration } from '../../service-catalog.pipes';
import { CountryPricingEditorComponent } from '../pricing-editor/country-pricing-editor.component';
import { DurationPriceRowComponent } from '../pricing-editor/duration-price-row.component';
import { GovernoratePickerComponent } from '../pricing-editor/governorate-picker.component';
import { coverageLabel, coversAll } from '../pricing-editor/coverage';
import {
  CountryPricingForm,
  PricingEditForm,
  createCountryPricingForm,
  createPricingEditForm,
  readCountryPricing,
  readPricingEdit,
  revealErrors,
} from '../pricing-editor/pricing-forms';

interface CountryGroup {
  countryId: string;
  countryName: string;
  currency: string;
  pricings: ServicePricing[];
  /** Union of governorates across the country's rows. */
  governorateIds: string[];
  coverage: string;
  coversAll: boolean;
  /** Rows don't all share the same governorates — show coverage per row. */
  mixedCoverage: boolean;
  /** One open-ended price for the whole service here — no further durations. */
  openEnded: boolean;
}

/** What the add panel is doing: a brand-new country, or more durations for one. */
type AddMode = { kind: 'country' } | { kind: 'durations'; countryId: string };

const DUPLICATE_MESSAGE = 'هذه المدة مسجّلة بالفعل لنفس الدولة. عدّل السعر الموجود أو اختر مدة مختلفة.';

/**
 * A service's offer per country: which governorates, which durations, at
 * what price range. Add a country, add durations to one, edit a row inline
 * (duration, prices, governorates) or delete it. Reads the service live from
 * the store, which every pricing endpoint refreshes.
 */
@Component({
  selector: 'app-pricing-dialog',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    ModalComponent,
    IconComponent,
    CountryFlagComponent,
    CountryPricingEditorComponent,
    DurationPriceRowComponent,
    GovernoratePickerComponent,
    ...CATALOG_PIPES,
  ],
  templateUrl: './pricing-dialog.component.html',
  styleUrl: './pricing-dialog.component.scss',
})
export class PricingDialogComponent {
  readonly open = input.required<boolean>();
  readonly serviceId = input<string | null>(null);
  /** The header's country scope — its group is listed first and highlighted. */
  readonly focusCountryId = input<string | null>(null);
  readonly startAdding = input(false);
  readonly closed = output<void>();

  private readonly fb = inject(NonNullableFormBuilder);
  private readonly store = inject(ServiceCatalogStore);
  private readonly countries = inject(CountriesStore);
  private readonly dialog = inject(DialogService);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly service = computed(() => this.store.byId(this.serviceId()));

  // ── add ──
  protected readonly addMode = signal<AddMode | null>(null);
  protected readonly addForm = signal<CountryPricingForm>(createCountryPricingForm(this.fb));
  protected readonly addError = signal<string | null>(null);

  // ── inline edit ──
  protected readonly editingId = signal<string | null>(null);
  protected readonly editForm = signal<PricingEditForm | null>(null);
  protected readonly editError = signal<string | null>(null);

  // ── request state ──
  protected readonly saving = signal(false);
  protected readonly removing = signal<ReadonlySet<string>>(new Set());
  protected readonly busy = computed(() => this.saving() || this.removing().size > 0);

  protected readonly groups = computed<CountryGroup[]>(() => {
    const s = this.service();
    if (!s) return [];
    const byCountry = new Map<string, ServicePricing[]>();
    for (const p of s.pricings) byCountry.set(p.countryId, [...(byCountry.get(p.countryId) ?? []), p]);

    const signature = (p: ServicePricing) => p.governorates.map((g) => g.id).sort().join(',');
    const groups = [...byCountry.entries()].map(([countryId, pricings]): CountryGroup => {
      const country = this.countries.byId(countryId);
      const ids = [...new Set(pricings.flatMap((p) => p.governorates.map((g) => g.id)))];
      return {
        countryId,
        countryName: pricings[0].countryName || country?.name || '',
        currency: pricings[0].currency || country?.currency || '',
        pricings,
        governorateIds: ids,
        coverage: coverageLabel(ids.length, country),
        coversAll: coversAll(ids.length, country),
        mixedCoverage: new Set(pricings.map(signature)).size > 1,
        openEnded: pricings.some((p) => p.durationMin === null),
      };
    });
    const focus = this.focusCountryId();
    // Keep the API's alphabetical order, but float the scoped country to the top.
    return focus ? [...groups.filter((g) => g.countryId === focus), ...groups.filter((g) => g.countryId !== focus)] : groups;
  });

  protected readonly pricedCountryIds = computed(() => this.groups().map((g) => g.countryId));
  protected readonly canAddCountry = computed(() => this.pricedCountryIds().length < this.countries.all().length);

  /** Durations already saved for the country being extended (drives the inline duplicate warning). */
  protected readonly existingDurations = computed<ReadonlySet<string>>(() => {
    const mode = this.addMode();
    if (mode?.kind !== 'durations') return new Set();
    const g = this.groups().find((x) => x.countryId === mode.countryId);
    return new Set(g?.pricings.map((p) => (p.durationMin === null ? 'open' : String(p.durationMin))) ?? []);
  });

  constructor() {
    effect(
      () => {
        if (!this.open()) return;
        this.serviceId();
        const startAdding = this.startAdding();
        untracked(() => {
          this.cancelEdit();
          this.cancelAdd();
          if (startAdding) this.startAddCountry();
        });
      },
      { allowSignalWrites: true },
    );
  }

  protected close(): void {
    if (!this.busy()) this.closed.emit();
  }

  protected coverageOf(p: ServicePricing): string {
    return coverageLabel(p.governorates.length, this.countries.byId(p.countryId));
  }

  protected governorateNames(p: ServicePricing): string {
    return p.governorates.map((g) => g.name).join('، ');
  }

  // ── add ──

  protected startAddCountry(): void {
    this.cancelEdit();
    const focus = this.focusCountryId();
    const country = focus && !this.pricedCountryIds().includes(focus) ? this.countries.byId(focus) : undefined;
    this.addForm.set(
      createCountryPricingForm(this.fb, {
        countryId: country?.id ?? '',
        governorateIds: country?.governorates.map((g) => g.id) ?? [],
      }),
    );
    this.addError.set(null);
    this.addMode.set({ kind: 'country' });
  }

  protected startAddDurations(g: CountryGroup): void {
    if (g.openEnded) return;
    this.cancelEdit();
    // Same governorates as the country's existing rows — a different area per duration is the exception.
    this.addForm.set(createCountryPricingForm(this.fb, { countryId: g.countryId, governorateIds: g.governorateIds }));
    this.addError.set(null);
    this.addMode.set({ kind: 'durations', countryId: g.countryId });
  }

  protected cancelAdd(): void {
    this.addMode.set(null);
    this.addError.set(null);
  }

  protected submitAdd(): void {
    const s = this.service();
    if (!s || this.saving()) return;
    this.addError.set(null);
    const form = this.addForm();
    if (form.invalid) {
      revealErrors(form);
      return;
    }
    const draft = readCountryPricing(form);
    const taken = new Set(s.pricings.map((p) => durationKey(p.countryId, p.durationMin)));
    if (draft.prices.some((p) => taken.has(durationKey(draft.countryId, p.durationMin)))) {
      this.addError.set(DUPLICATE_MESSAGE);
      return;
    }
    const isNewCountry = this.addMode()?.kind === 'country';
    this.run(this.store.addPricing(s.id, draft), this.addError, 'تعذّرت إضافة الأسعار', (updated) => {
      this.addMode.set(null);
      const name = updated.pricings.find((p) => p.countryId === draft.countryId)?.countryName ?? '';
      this.toast.success(isNewCountry ? `تمت إضافة ${name} إلى الخدمة` : `تمت إضافة ${draft.prices.length === 1 ? 'مدة جديدة' : 'مدد جديدة'} في ${name}`);
    });
  }

  // ── edit ──

  protected startEdit(p: ServicePricing): void {
    this.cancelAdd();
    this.editForm.set(
      createPricingEditForm(this.fb, {
        durationMin: p.durationMin,
        priceMin: p.priceMin,
        priceMax: p.priceMax,
        governorateIds: p.governorates.map((g) => g.id),
      }),
    );
    this.editError.set(null);
    this.editingId.set(p.id);
  }

  protected cancelEdit(): void {
    this.editingId.set(null);
    this.editForm.set(null);
    this.editError.set(null);
  }

  protected submitEdit(p: ServicePricing): void {
    const s = this.service();
    const form = this.editForm();
    if (!s || !form || this.saving()) return;
    this.editError.set(null);
    if (form.invalid) {
      revealErrors(form);
      return;
    }
    const update = readPricingEdit(form);
    const clash = s.pricings.some(
      (x) => x.id !== p.id && durationKey(x.countryId, x.durationMin) === durationKey(p.countryId, update.durationMin),
    );
    if (clash) {
      this.editError.set(DUPLICATE_MESSAGE);
      return;
    }
    this.run(this.store.updatePricing(s.id, p.id, update), this.editError, 'تعذّر حفظ السعر', () => {
      this.cancelEdit();
      this.toast.success(`تم تحديث سعر ${p.countryName} (${formatDuration(update.durationMin)})`);
    });
  }

  // ── delete ──

  protected async remove(p: ServicePricing): Promise<void> {
    const s = this.service();
    if (!s || this.removing().has(p.id)) return;
    const label = `${p.countryName} (${formatDuration(p.durationMin)})`;
    const onlyOne = s.pricings.length === 1;
    const ok = await this.dialog.confirm({
      title: 'حذف السعر',
      message: onlyOne
        ? `هذا آخر سعر لخدمة "${s.name}". بعد حذفه لن تظهر الخدمة في أي دولة حتى تضيف سعرًا جديدًا.`
        : `سيتم حذف سعر ${label} من خدمة "${s.name}".`,
      confirmText: 'حذف السعر',
      type: 'danger',
    });
    if (!ok) return;

    this.setRemoving(p.id, true);
    this.store
      .removePricing(s.id, p.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.setRemoving(p.id, false);
          if (this.editingId() === p.id) this.cancelEdit();
          this.toast.success(`تم حذف سعر ${label}`);
        },
        error: (err: ApiError) => {
          this.setRemoving(p.id, false);
          this.toast.error(apiErrorToMessage(err, 'حدث خطأ أثناء حذف السعر'), { title: `تعذّر حذف سعر ${label}` });
        },
      });
  }

  // ── helpers ──

  private run(
    request$: Observable<CatalogService>,
    error: WritableSignal<string | null>,
    fallback: string,
    onSuccess: (s: CatalogService) => void,
  ): void {
    this.saving.set(true);
    request$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (updated) => {
        this.saving.set(false);
        onSuccess(updated);
      },
      error: (err: ApiError) => {
        this.saving.set(false);
        error.set(apiErrorToMessage(err, fallback));
      },
    });
  }

  private setRemoving(id: string, on: boolean): void {
    this.removing.update((set) => {
      const next = new Set(set);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }
}
