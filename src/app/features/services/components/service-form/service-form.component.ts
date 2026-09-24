import { ChangeDetectionStrategy, Component, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { ModalComponent } from '../../../../shared/components/modal/modal.component';
import { FormErrorComponent } from '../../../../shared/components/form-error/form-error.component';
import { ToastService } from '../../../../core/services/toast.service';
import { ClinicService, ServiceDraft } from '../../services.models';
import { ServicesStore } from '../../services.store';
import { CategoriesStore } from '../../categories.store';
import { CountriesStore } from '../../../countries/countries.store';
import { CountryScopeService } from '../../../countries/country-scope.service';

/** Add / edit service modal. Duration is optional per service. */
@Component({
  selector: 'app-service-form',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, ModalComponent, FormErrorComponent],
  templateUrl: './service-form.component.html',
  styleUrl: './service-form.component.scss',
})
export class ServiceFormComponent {
  readonly open = input.required<boolean>();
  readonly service = input<ClinicService | null>(null);
  /** Pre-selected category when adding from a category filter. */
  readonly categoryId = input<string | null>(null);
  readonly closed = output<void>();

  private readonly fb = inject(FormBuilder);
  private readonly store = inject(ServicesStore);
  private readonly toast = inject(ToastService);
  private readonly countriesStore = inject(CountriesStore);
  private readonly scope = inject(CountryScopeService);
  protected readonly countries = this.countriesStore.all;
  protected readonly categories = inject(CategoriesStore).all;

  protected readonly saving = signal(false);
  protected readonly title = computed(() => (this.service() ? 'تعديل الخدمة' : 'إضافة خدمة جديدة'));

  protected readonly form = this.fb.nonNullable.group({
    countryId: ['', Validators.required],
    categoryId: ['', Validators.required],
    name: ['', [Validators.required, Validators.minLength(3)]],
    price: [200, [Validators.required, Validators.min(1), Validators.max(1000000)]],
    hasDuration: [true],
    durationMin: [30, [Validators.min(5), Validators.max(480)]],
    description: ['', [Validators.required, Validators.maxLength(200)]],
    active: [true],
  });

  private readonly countryId = toSignal(this.form.controls.countryId.valueChanges, { initialValue: '' });
  protected readonly currency = computed(() => this.countriesStore.currency(this.countryId()) || '—');

  constructor() {
    effect(() => {
      if (!this.open()) return;
      const s = this.service();
      untracked(() => {
        this.saving.set(false);
        this.form.reset({
          countryId: s?.countryId ?? this.scope.country()?.id ?? this.countriesStore.all()[0]?.id ?? '',
          categoryId: s?.categoryId ?? this.categoryId() ?? this.categories()[0]?.id ?? '',
          name: s?.name ?? '',
          price: s?.price ?? 200,
          hasDuration: s ? s.durationMin !== null : true,
          durationMin: s?.durationMin ?? 30,
          description: s?.description ?? '',
          active: s?.active ?? true,
        });
      });
    }, { allowSignalWrites: true });
  }

  protected toggle(key: 'hasDuration' | 'active'): void {
    this.form.controls[key].setValue(!this.form.controls[key].value);
  }

  protected invalid(name: 'countryId' | 'categoryId' | 'name' | 'price' | 'durationMin' | 'description'): boolean {
    const c = this.form.controls[name];
    return c.invalid && c.touched;
  }

  protected submit(): void {
    if (this.saving()) return;
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const v = this.form.getRawValue();
    const draft: ServiceDraft = {
      countryId: v.countryId,
      categoryId: v.categoryId,
      name: v.name.trim(),
      description: v.description.trim(),
      price: Number(v.price),
      durationMin: v.hasDuration ? Number(v.durationMin) : null,
      active: v.active,
    };
    this.saving.set(true);
    setTimeout(() => {
      const existing = this.service();
      if (existing) {
        this.store.update(existing.id, draft);
        this.toast.success(`تم تحديث خدمة "${draft.name}"`);
      } else {
        this.store.create(draft);
        this.toast.success(`تمت إضافة خدمة "${draft.name}" بنجاح`);
      }
      this.saving.set(false);
      this.closed.emit();
    }, 500);
  }
}
