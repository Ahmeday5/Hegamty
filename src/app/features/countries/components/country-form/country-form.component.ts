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
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Observable } from 'rxjs';
import { ModalComponent } from '../../../../shared/components/modal/modal.component';
import { FormErrorComponent } from '../../../../shared/components/form-error/form-error.component';
import { IconComponent } from '../../../../shared/components/icon/icon.component';
import { TagInputComponent } from '../../../../shared/components/tag-input/tag-input.component';
import { ToastService } from '../../../../core/services/toast.service';
import { ApiError } from '../../../../core/models/api-response.model';
import { apiErrorToMessage } from '../../../../core/utils/api-error.util';
import { Country } from '../../countries.models';
import { CountriesStore } from '../../countries.store';
import { CountryFlagComponent } from '../../country-flag.component';
import { countDivisions, resolveCountryMeta } from '../../country-registry';
import { DivisionCountPipe } from '../../country.pipes';

/**
 * Add / edit a market. Creating also seeds its first governorates; on edit
 * they're managed from the governorates dialog (the update endpoint only
 * accepts the country's own fields).
 */
@Component({
  selector: 'app-country-form',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, ModalComponent, FormErrorComponent, IconComponent, TagInputComponent, CountryFlagComponent, DivisionCountPipe],
  templateUrl: './country-form.component.html',
  styleUrl: './country-form.component.scss',
})
export class CountryFormComponent {
  readonly open = input.required<boolean>();
  readonly country = input<Country | null>(null);
  readonly closed = output<void>();
  /** Edit mode shortcut to the governorates dialog. */
  readonly manageGovernorates = output<Country>();

  private readonly fb = inject(FormBuilder);
  private readonly store = inject(CountriesStore);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly tags = viewChild(TagInputComponent);

  protected readonly saving = signal(false);
  protected readonly serverError = signal<string | null>(null);
  protected readonly governorates = signal<string[]>([]);
  protected readonly submitted = signal(false);

  protected readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(60)]],
    nameEn: ['', [Validators.required, Validators.maxLength(60), Validators.pattern(/^[A-Za-z][A-Za-z .'()-]*$/)]],
    currency: ['', [Validators.required, Validators.maxLength(30)]],
  });

  private readonly value = toSignal(this.form.valueChanges, { initialValue: this.form.getRawValue() });

  protected readonly isEdit = computed(() => !!this.country());
  protected readonly title = computed(() => (this.country() ? `تعديل بيانات ${this.country()!.name}` : 'إضافة دولة جديدة'));

  /** Live preview: the flag and division term follow what the admin types. */
  protected readonly preview = computed(() => {
    const v = this.value();
    const name = v.name?.trim() ?? '';
    const nameEn = v.nameEn?.trim() ?? '';
    return { name, nameEn, ...resolveCountryMeta(name, nameEn) };
  });
  protected readonly governoratesInvalid = computed(() => this.submitted() && !this.governorates().length);
  protected readonly governoratesSummary = computed(() => countDivisions(this.governorates().length, this.preview().division));

  constructor() {
    effect(
      () => {
        if (!this.open()) return;
        const c = this.country();
        untracked(() => {
          this.saving.set(false);
          this.submitted.set(false);
          this.serverError.set(null);
          this.governorates.set([]);
          this.form.reset({ name: c?.name ?? '', nameEn: c?.nameEn ?? '', currency: c?.currency ?? '' });
        });
      },
      { allowSignalWrites: true },
    );
  }

  protected invalid(name: keyof typeof this.form.controls): boolean {
    const c = this.form.controls[name];
    return c.invalid && c.touched;
  }

  protected close(): void {
    if (!this.saving()) this.closed.emit();
  }

  protected openGovernorates(): void {
    const c = this.country();
    if (c) this.manageGovernorates.emit(c);
  }

  protected submit(): void {
    if (this.saving()) return;
    this.tags()?.commit();
    this.submitted.set(true);
    this.serverError.set(null);

    const existing = this.country();
    if (this.form.invalid || (!existing && !this.governorates().length)) {
      this.form.markAllAsTouched();
      return;
    }

    const v = this.form.getRawValue();
    const fields = { name: v.name.trim(), nameEn: v.nameEn.trim(), currency: v.currency.trim() };
    const request$: Observable<Country> = existing
      ? this.store.update(existing.id, fields)
      : this.store.create({ ...fields, governorateNames: this.governorates() });

    this.saving.set(true);
    request$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (c) => {
        this.saving.set(false);
        this.toast.success(existing ? `تم تحديث بيانات ${c.name}` : `تمت إضافة ${c.name} بنجاح`);
        this.closed.emit();
      },
      error: (err: ApiError) => {
        this.saving.set(false);
        this.serverError.set(apiErrorToMessage(err, existing ? 'تعذّر حفظ التعديلات' : 'تعذّرت إضافة الدولة'));
      },
    });
  }
}
