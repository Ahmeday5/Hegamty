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
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Observable } from 'rxjs';
import { ModalComponent } from '../../../../shared/components/modal/modal.component';
import { FormErrorComponent } from '../../../../shared/components/form-error/form-error.component';
import { IconComponent } from '../../../../shared/components/icon/icon.component';
import { formatNumber } from '../../../../shared/utils/format.util';
import { ToastService } from '../../../../core/services/toast.service';
import { ApiError } from '../../../../core/models/api-response.model';
import { apiErrorToMessage } from '../../../../core/utils/api-error.util';
import { CountriesStore } from '../../../countries/countries.store';
import { PACKAGE_PERIODS, PERIOD_META, PackageDraft, PeriodMeta, QUARTERS, TechPackage, durationMeta, periodOf } from '../../packages.models';
import { PackagesStore } from '../../packages.store';

const NAME_MAX = 80;
const DESC_MAX = 250;
const FEATURE_MAX = 80;
const FEATURES_MAX = 12;
const PRICE_MAX = 1_000_000;
const DEFAULT_FEATURES = ['استقبال طلبات غير محدودة', 'الظهور في نتائج البحث'];

interface DurationOption extends PeriodMeta {
  /** A served length outside the standard periods (kept as-is on edit). */
  custom: boolean;
}

/** Add / edit a technician package. */
@Component({
  selector: 'app-package-form',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, ModalComponent, FormErrorComponent, IconComponent],
  templateUrl: './package-form.component.html',
  styleUrl: './package-form.component.scss',
})
export class PackageFormComponent {
  readonly open = input.required<boolean>();
  readonly pkg = input<TechPackage | null>(null);
  /** Pre-selected country for a new package (the header's country scope). */
  readonly countryId = input<string | null>(null);
  readonly closed = output<void>();

  private readonly fb = inject(FormBuilder);
  private readonly store = inject(PackagesStore);
  private readonly toast = inject(ToastService);
  private readonly countriesStore = inject(CountriesStore);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly nameMax = NAME_MAX;
  protected readonly descMax = DESC_MAX;
  protected readonly featureMax = FEATURE_MAX;
  protected readonly featuresMax = FEATURES_MAX;
  protected readonly quarters = QUARTERS;
  protected readonly countries = this.countriesStore.all;

  protected readonly saving = signal(false);
  protected readonly serverError = signal<string | null>(null);
  protected readonly features = signal<string[]>([]);
  protected readonly featureDraft = signal('');
  protected readonly title = computed(() => (this.pkg() ? `تعديل "${this.pkg()!.name}"` : 'باقة جديدة'));

  protected readonly form = this.fb.nonNullable.group({
    countryId: ['', Validators.required],
    name: ['', [Validators.required, Validators.minLength(3), Validators.maxLength(NAME_MAX)]],
    durationDays: [PERIOD_META.quarterly.days, [Validators.required, Validators.min(1)]],
    price: [0, [Validators.required, Validators.min(1), Validators.max(PRICE_MAX)]],
    description: ['', Validators.maxLength(DESC_MAX)],
    featured: [false],
    active: [true],
  });

  protected readonly value = toSignal(this.form.valueChanges, { initialValue: this.form.getRawValue() });

  protected readonly currency = computed(() => this.countriesStore.currency(this.value().countryId ?? '') || '—');
  protected readonly durationDays = computed(() => this.value().durationDays ?? PERIOD_META.quarterly.days);

  /** The four standard periods, plus the package's own length when it's non-standard. */
  protected readonly durations = computed<DurationOption[]>(() => {
    const standard = PACKAGE_PERIODS.map((p) => ({ ...PERIOD_META[p], custom: false }));
    const served = this.pkg()?.durationDays;
    return served && !periodOf(served) ? [...standard, { ...durationMeta(served), custom: true }] : standard;
  });

  /** Live per-month equivalent of the entered price, `''` when there's no valid price. */
  protected readonly monthly = computed(() => {
    const price = Number(this.value().price);
    return price > 0 ? formatNumber(Math.round(price / durationMeta(this.durationDays()).months)) : '';
  });
  protected readonly renewal = computed(() => durationMeta(this.durationDays()).per);
  protected readonly descLength = computed(() => this.value().description?.length ?? 0);
  protected readonly featuresFull = computed(() => this.features().length >= FEATURES_MAX);

  constructor() {
    effect(
      () => {
        if (!this.open()) return;
        const p = this.pkg();
        const scoped = this.countryId();
        untracked(() => {
          this.saving.set(false);
          this.serverError.set(null);
          this.featureDraft.set('');
          this.features.set(p ? [...p.features] : [...DEFAULT_FEATURES]);
          this.form.reset({
            countryId: p?.countryId ?? scoped ?? '',
            name: p?.name ?? '',
            durationDays: p?.durationDays ?? PERIOD_META.quarterly.days,
            price: p?.price ?? 0,
            description: p?.description ?? '',
            featured: p?.featured ?? false,
            active: p?.active ?? true,
          });
        });
      },
      { allowSignalWrites: true },
    );
  }

  protected setDuration(days: number): void {
    this.form.controls.durationDays.setValue(days);
  }

  protected toggle(key: 'featured' | 'active'): void {
    this.form.controls[key].setValue(!this.form.controls[key].value);
  }

  protected addFeature(event?: Event): void {
    event?.preventDefault();
    const v = this.featureDraft().trim().slice(0, FEATURE_MAX);
    if (!v || this.featuresFull()) return;
    this.features.update((list) => (list.includes(v) ? list : [...list, v]));
    this.featureDraft.set('');
  }

  protected removeFeature(f: string): void {
    this.features.update((list) => list.filter((x) => x !== f));
  }

  protected invalid(name: 'countryId' | 'name' | 'price' | 'description'): boolean {
    const c = this.form.controls[name];
    return c.invalid && c.touched;
  }

  protected close(): void {
    if (!this.saving()) this.closed.emit();
  }

  protected submit(): void {
    if (this.saving()) return;
    this.addFeature();
    this.serverError.set(null);
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const v = this.form.getRawValue();
    const draft: PackageDraft = {
      countryId: v.countryId,
      name: v.name.trim(),
      durationDays: v.durationDays,
      price: Number(v.price),
      description: v.description.trim(),
      features: this.features(),
      featured: v.featured,
      active: v.active,
    };
    const existing = this.pkg();
    const request$: Observable<TechPackage> = existing ? this.store.update(existing.id, draft) : this.store.create(draft);

    this.saving.set(true);
    request$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (p) => {
        this.saving.set(false);
        this.toast.success(
          existing ? `تم تحديث "${p.name}" — السعر الجديد يطبّق على الاشتراكات القادمة فقط` : `تمت إضافة "${p.name}"${p.active ? ' وأصبحت متاحة للفنيين' : ''}`,
        );
        this.closed.emit();
      },
      error: (err: ApiError) => {
        this.saving.set(false);
        this.serverError.set(apiErrorToMessage(err, existing ? 'تعذّر حفظ التعديلات' : 'تعذّرت إضافة الباقة'));
      },
    });
  }
}
