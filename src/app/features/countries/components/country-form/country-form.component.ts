import { ChangeDetectionStrategy, Component, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
import { AbstractControl, FormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { ModalComponent } from '../../../../shared/components/modal/modal.component';
import { FormErrorComponent } from '../../../../shared/components/form-error/form-error.component';
import { IconComponent } from '../../../../shared/components/icon/icon.component';
import { Tone } from '../../../../shared/components/kpi-card/kpi-card.component';
import { ToastService } from '../../../../core/services/toast.service';
import { CountryFlagComponent } from '../../country-flag.component';
import { BASE_CURRENCY, Country, CountryDraft } from '../../countries.models';
import { CountriesStore } from '../../countries.store';

const TONES: Tone[] = ['green', 'blue', 'teal', 'purple', 'amber', 'pink', 'red'];

/** Add / edit a market: currency, dialing code, VAT, FX rate and its cities. */
@Component({
  selector: 'app-country-form',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, ModalComponent, FormErrorComponent, IconComponent, CountryFlagComponent],
  templateUrl: './country-form.component.html',
  styleUrl: './country-form.component.scss',
})
export class CountryFormComponent {
  readonly open = input.required<boolean>();
  readonly country = input<Country | null>(null);
  readonly closed = output<void>();

  private readonly fb = inject(FormBuilder);
  private readonly store = inject(CountriesStore);
  private readonly toast = inject(ToastService);

  protected readonly tones = TONES;
  protected readonly base = BASE_CURRENCY;
  protected readonly saving = signal(false);
  protected readonly cities = signal<string[]>([]);
  protected readonly cityDraft = signal('');
  protected readonly citiesTouched = signal(false);
  protected readonly title = computed(() => (this.country() ? `تعديل ${this.country()!.name}` : 'إضافة دولة جديدة'));

  private readonly uniqueCode = (c: AbstractControl): ValidationErrors | null => {
    const v = String(c.value ?? '').toUpperCase();
    return !this.country() && this.store.byId(v) ? { taken: 'رمز الدولة مستخدم بالفعل' } : null;
  };

  protected readonly form = this.fb.nonNullable.group({
    id: ['', [Validators.required, Validators.pattern(/^[A-Za-z]{2}$/), this.uniqueCode]],
    name: ['', [Validators.required, Validators.minLength(2)]],
    currencyCode: ['', [Validators.required, Validators.pattern(/^[A-Za-z]{3}$/)]],
    currencySymbol: ['', [Validators.required, Validators.maxLength(6)]],
    phoneCode: ['+', [Validators.required, Validators.pattern(/^\+\d{1,4}$/)]],
    phoneLength: [10, [Validators.required, Validators.min(6), Validators.max(15)]],
    vatPct: [15, [Validators.required, Validators.min(0), Validators.max(50)]],
    rateToBase: [1, [Validators.required, Validators.min(0.0001)]],
    tone: ['green' as Tone],
    active: [true],
  });

  constructor() {
    effect(() => {
      if (!this.open()) return;
      const c = this.country();
      untracked(() => {
        this.saving.set(false);
        this.cityDraft.set('');
        this.citiesTouched.set(false);
        this.cities.set(c ? [...c.cities] : []);
        this.form.reset({
          id: c?.id ?? '',
          name: c?.name ?? '',
          currencyCode: c?.currencyCode ?? '',
          currencySymbol: c?.currencySymbol ?? '',
          phoneCode: c?.phoneCode ?? '+',
          phoneLength: c?.phoneLength ?? 10,
          vatPct: c ? Math.round(c.vatRate * 1000) / 10 : 15,
          rateToBase: c?.rateToBase ?? 1,
          tone: c?.tone ?? 'green',
          active: c?.active ?? true,
        });
        if (c) this.form.controls.id.disable();
        else this.form.controls.id.enable();
      });
    }, { allowSignalWrites: true });
  }

  protected invalid(name: 'id' | 'name' | 'currencyCode' | 'currencySymbol' | 'phoneCode' | 'phoneLength' | 'vatPct' | 'rateToBase'): boolean {
    const c = this.form.controls[name];
    return c.invalid && c.touched;
  }

  protected addCity(event?: Event): void {
    event?.preventDefault();
    const parts = this.cityDraft().split(/[،,\n]/).map((s) => s.trim()).filter(Boolean);
    if (!parts.length) return;
    this.cities.update((list) => [...list, ...parts.filter((p) => !list.includes(p))]);
    this.cityDraft.set('');
  }

  protected removeCity(city: string): void {
    this.cities.update((list) => list.filter((c) => c !== city));
    this.citiesTouched.set(true);
  }

  protected setTone(t: Tone): void {
    this.form.controls.tone.setValue(t);
  }

  protected toggleActive(): void {
    this.form.controls.active.setValue(!this.form.controls.active.value);
  }

  protected submit(): void {
    if (this.saving()) return;
    this.addCity();
    this.citiesTouched.set(true);
    if (this.form.invalid || !this.cities().length) {
      this.form.markAllAsTouched();
      return;
    }
    const v = this.form.getRawValue();
    const draft: CountryDraft = {
      id: v.id.toUpperCase(),
      name: v.name.trim(),
      currencyCode: v.currencyCode.toUpperCase(),
      currencySymbol: v.currencySymbol.trim(),
      phoneCode: v.phoneCode.trim(),
      phoneLength: Number(v.phoneLength),
      vatRate: Number(v.vatPct) / 100,
      rateToBase: Number(v.rateToBase),
      cities: this.cities(),
      tone: v.tone,
      active: v.active,
    };
    this.saving.set(true);
    setTimeout(() => {
      const existing = this.country();
      if (existing) {
        this.store.update(existing.id, draft);
        this.toast.success(`تم تحديث بيانات ${draft.name}`);
      } else {
        this.store.create(draft);
        this.toast.success(`تمت إضافة ${draft.name} — يمكنك الآن إضافة خدماتها وفنييها وسائقيها`);
      }
      this.saving.set(false);
      this.closed.emit();
    }, 600);
  }
}
