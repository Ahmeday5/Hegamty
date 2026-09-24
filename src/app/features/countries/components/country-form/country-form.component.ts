import { ChangeDetectionStrategy, Component, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
import { AbstractControl, FormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { ModalComponent } from '../../../../shared/components/modal/modal.component';
import { FormErrorComponent } from '../../../../shared/components/form-error/form-error.component';
import { IconComponent } from '../../../../shared/components/icon/icon.component';
import { ToastService } from '../../../../core/services/toast.service';
import { Country, CountryDraft } from '../../countries.models';
import { CountriesStore } from '../../countries.store';

/** Add / edit a market: name, currency, dialing code and its cities. */
@Component({
  selector: 'app-country-form',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, ModalComponent, FormErrorComponent, IconComponent],
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

  protected readonly saving = signal(false);
  protected readonly cities = signal<string[]>([]);
  protected readonly cityDraft = signal('');
  protected readonly citiesTouched = signal(false);
  protected readonly title = computed(() => (this.country() ? `تعديل ${this.country()!.name}` : 'إضافة دولة جديدة'));

  private readonly uniqueDial = (c: AbstractControl): ValidationErrors | null =>
    this.store.dialCodeTaken(String(c.value ?? '').trim(), this.country()?.id) ? { taken: 'كود الدولة مستخدم لدولة أخرى' } : null;

  protected readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.minLength(2)]],
    currency: ['', [Validators.required, Validators.maxLength(20)]],
    dialCode: ['+', [Validators.required, Validators.pattern(/^\+\d{1,4}$/), this.uniqueDial]],
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
        this.form.reset({ name: c?.name ?? '', currency: c?.currency ?? '', dialCode: c?.dialCode ?? '+' });
      });
    }, { allowSignalWrites: true });
  }

  protected invalid(name: 'name' | 'currency' | 'dialCode'): boolean {
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
      name: v.name.trim(),
      currency: v.currency.trim(),
      dialCode: v.dialCode.trim(),
      cities: this.cities(),
    };
    this.saving.set(true);
    setTimeout(() => {
      const existing = this.country();
      if (existing) {
        this.store.update(existing.id, draft);
        this.toast.success(`تم تحديث بيانات ${draft.name}`);
      } else {
        this.store.create(draft);
        this.toast.success(`تمت إضافة ${draft.name} — أضف الآن خدماتها وباقات فنييها`);
      }
      this.saving.set(false);
      this.closed.emit();
    }, 500);
  }
}
