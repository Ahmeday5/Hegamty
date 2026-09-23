import { ChangeDetectionStrategy, Component, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ModalComponent } from '../../../../shared/components/modal/modal.component';
import { FormErrorComponent } from '../../../../shared/components/form-error/form-error.component';
import { IconComponent, IconName } from '../../../../shared/components/icon/icon.component';
import { Tone } from '../../../../shared/components/kpi-card/kpi-card.component';
import { ToastService } from '../../../../core/services/toast.service';
import { CATEGORY_META, ClinicService, SERVICE_ICONS, SERVICE_TONES, ServiceCategory, ServiceDraft } from '../../services.models';
import { ServicesStore } from '../../services.store';
import { CountriesStore } from '../../../countries/countries.store';
import { CountryScopeService } from '../../../countries/country-scope.service';
import { toSignal } from '@angular/core/rxjs-interop';

/** Add / edit service modal. */
@Component({
  selector: 'app-service-form',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, ModalComponent, FormErrorComponent, IconComponent],
  templateUrl: './service-form.component.html',
  styleUrl: './service-form.component.scss',
})
export class ServiceFormComponent {
  readonly open = input.required<boolean>();
  readonly service = input<ClinicService | null>(null);
  readonly closed = output<void>();

  private readonly fb = inject(FormBuilder);
  private readonly store = inject(ServicesStore);
  private readonly toast = inject(ToastService);

  protected readonly categories = (Object.keys(CATEGORY_META) as ServiceCategory[]).map((id) => ({ id, label: CATEGORY_META[id].label }));
  protected readonly tones = SERVICE_TONES;
  protected readonly icons = SERVICE_ICONS;
  protected readonly saving = signal(false);
  protected readonly title = computed(() => (this.service() ? 'تعديل الخدمة' : 'إضافة خدمة جديدة'));

  private readonly countriesStore = inject(CountriesStore);
  private readonly scope = inject(CountryScopeService);
  protected readonly countries = this.countriesStore.all;

  protected readonly form = this.fb.nonNullable.group({
    countryId: ['', Validators.required],
    name: ['', [Validators.required, Validators.minLength(3)]],
    category: ['cupping' as ServiceCategory],
    price: [200, [Validators.required, Validators.min(1), Validators.max(10000)]],
    durationMin: [30, [Validators.required, Validators.min(5), Validators.max(480)]],
    homeVisit: [false],
    homeFee: [0, [Validators.min(0), Validators.max(5000)]],
    description: ['', [Validators.required, Validators.maxLength(200)]],
    active: [true],
    tone: ['green' as Tone],
    icon: ['droplet' as IconName],
  });

  private readonly countryId = toSignal(this.form.controls.countryId.valueChanges, { initialValue: '' });
  /** Currency label for price inputs, following the selected country. */
  protected readonly currency = computed(() => this.countriesStore.symbol(this.countryId()) || '—');

  constructor() {
    effect(() => {
      if (!this.open()) return;
      const s = this.service();
      untracked(() => {
        this.saving.set(false);
        this.form.reset({
          countryId: s?.countryId ?? this.scope.country()?.id ?? this.countriesStore.active()[0]?.id ?? '',
          name: s?.name ?? '',
          category: s?.category ?? 'cupping',
          price: s?.price ?? 200,
          durationMin: s?.durationMin ?? 30,
          homeVisit: s?.homeVisit ?? false,
          homeFee: s?.homeFee ?? 0,
          description: s?.description ?? '',
          active: s?.active ?? true,
          tone: s?.tone ?? 'green',
          icon: s?.icon ?? 'droplet',
        });
      });
    }, { allowSignalWrites: true });
  }

  protected set<K extends 'homeVisit' | 'active' | 'tone' | 'icon' | 'category'>(key: K, value: ServiceDraft[K]): void {
    this.form.controls[key].setValue(value as never);
  }

  protected invalid(name: 'countryId' | 'name' | 'price' | 'durationMin' | 'homeFee' | 'description'): boolean {
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
      ...v,
      name: v.name.trim(),
      description: v.description.trim(),
      price: Number(v.price),
      durationMin: Number(v.durationMin),
      homeFee: v.homeVisit ? Number(v.homeFee) : 0,
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
    }, 600);
  }
}
