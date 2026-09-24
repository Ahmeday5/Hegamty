import { ChangeDetectionStrategy, Component, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { ModalComponent } from '../../../../shared/components/modal/modal.component';
import { FormErrorComponent } from '../../../../shared/components/form-error/form-error.component';
import { IconComponent } from '../../../../shared/components/icon/icon.component';
import { ToastService } from '../../../../core/services/toast.service';
import { CountriesStore } from '../../../countries/countries.store';
import { CountryScopeService } from '../../../countries/country-scope.service';
import { PERIOD_META, PackageDraft, PackagePeriod, TechPackage } from '../../packages.models';
import { PackagesStore } from '../../packages.store';

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
  readonly closed = output<void>();

  private readonly fb = inject(FormBuilder);
  private readonly store = inject(PackagesStore);
  private readonly toast = inject(ToastService);
  private readonly countriesStore = inject(CountriesStore);
  private readonly scope = inject(CountryScopeService);

  protected readonly countries = this.countriesStore.all;
  protected readonly periods = (Object.keys(PERIOD_META) as PackagePeriod[]).map((id) => ({ id, ...PERIOD_META[id] }));
  protected readonly saving = signal(false);
  protected readonly features = signal<string[]>([]);
  protected readonly featureDraft = signal('');
  protected readonly title = computed(() => (this.pkg() ? 'تعديل الباقة' : 'باقة جديدة'));

  protected readonly form = this.fb.nonNullable.group({
    countryId: ['', Validators.required],
    name: ['', [Validators.required, Validators.minLength(3)]],
    period: ['monthly' as PackagePeriod],
    price: [199, [Validators.required, Validators.min(1), Validators.max(1000000)]],
    description: ['', Validators.maxLength(160)],
    featured: [false],
    active: [true],
  });

  private readonly countryId = toSignal(this.form.controls.countryId.valueChanges, { initialValue: '' });
  protected readonly currency = computed(() => this.countriesStore.currency(this.countryId()) || '—');

  constructor() {
    effect(() => {
      if (!this.open()) return;
      const p = this.pkg();
      untracked(() => {
        this.saving.set(false);
        this.featureDraft.set('');
        this.features.set(p ? [...p.features] : ['استقبال طلبات غير محدودة', 'الظهور في نتائج البحث']);
        this.form.reset({
          countryId: p?.countryId ?? this.scope.country()?.id ?? this.countriesStore.all()[0]?.id ?? '',
          name: p?.name ?? '',
          period: p?.period ?? 'monthly',
          price: p?.price ?? 199,
          description: p?.description ?? '',
          featured: p?.featured ?? false,
          active: p?.active ?? true,
        });
      });
    }, { allowSignalWrites: true });
  }

  protected setPeriod(p: PackagePeriod): void {
    this.form.controls.period.setValue(p);
  }

  protected toggle(key: 'featured' | 'active'): void {
    this.form.controls[key].setValue(!this.form.controls[key].value);
  }

  protected addFeature(event?: Event): void {
    event?.preventDefault();
    const v = this.featureDraft().trim();
    if (!v) return;
    this.features.update((list) => (list.includes(v) ? list : [...list, v]));
    this.featureDraft.set('');
  }

  protected removeFeature(f: string): void {
    this.features.update((list) => list.filter((x) => x !== f));
  }

  protected invalid(name: 'countryId' | 'name' | 'price'): boolean {
    const c = this.form.controls[name];
    return c.invalid && c.touched;
  }

  protected submit(): void {
    if (this.saving()) return;
    this.addFeature();
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const v = this.form.getRawValue();
    const draft: PackageDraft = {
      countryId: v.countryId,
      name: v.name.trim(),
      period: v.period,
      price: Number(v.price),
      description: v.description.trim(),
      features: this.features(),
      featured: v.featured,
      active: v.active,
    };
    this.saving.set(true);
    setTimeout(() => {
      const existing = this.pkg();
      if (existing) {
        this.store.update(existing.id, draft);
        this.toast.success(`تم تحديث "${draft.name}" — السعر الجديد يطبّق على الاشتراكات القادمة فقط`);
      } else {
        this.store.create(draft);
        this.toast.success(`تمت إضافة "${draft.name}" وأصبحت متاحة للفنيين`);
      }
      this.saving.set(false);
      this.closed.emit();
    }, 500);
  }
}
