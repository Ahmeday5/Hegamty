import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ModalComponent } from '../../../../shared/components/modal/modal.component';
import { FormErrorComponent } from '../../../../shared/components/form-error/form-error.component';
import { ToastService } from '../../../../core/services/toast.service';
import { PEOPLE_CONFIG, SPECIALTIES, STATUS_META } from '../../people.config';
import { CountriesStore } from '../../../countries/countries.store';
import { CountryScopeService } from '../../../countries/country-scope.service';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { Person, PersonDraft, PersonKind, PersonStatus } from '../../people.models';
import { PeopleStore } from '../../people.store';

/** Add / edit modal shared by customers, drivers and technicians. */
@Component({
  selector: 'app-person-form',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, ModalComponent, FormErrorComponent],
  templateUrl: './person-form.component.html',
})
export class PersonFormComponent {
  readonly kind = input.required<PersonKind>();
  readonly open = input.required<boolean>();
  /** `null` → create mode. */
  readonly person = input<Person | null>(null);
  readonly closed = output<void>();
  readonly saved = output<Person>();

  private readonly fb = inject(FormBuilder);
  private readonly store = inject(PeopleStore);
  private readonly toast = inject(ToastService);

  private readonly countriesStore = inject(CountriesStore);
  private readonly scope = inject(CountryScopeService);
  protected readonly countries = this.countriesStore.all;
  protected readonly specialties = SPECIALTIES;
  protected readonly statuses = (Object.keys(STATUS_META) as PersonStatus[]).map((id) => ({
    id,
    label: STATUS_META[id].label,
  }));
  protected readonly saving = signal(false);
  protected readonly cfg = computed(() => PEOPLE_CONFIG[this.kind()]);
  protected readonly title = computed(() =>
    this.person() ? `تعديل بيانات ${this.cfg().singular}` : `إضافة ${this.cfg().singular} جديد`,
  );

  protected readonly form = this.fb.nonNullable.group({
    countryId: ['', Validators.required],
    name: ['', [Validators.required, Validators.minLength(3)]],
    phone: ['', [Validators.required, Validators.pattern(/^\d{7,15}$/)]],
    email: ['', [Validators.required, Validators.email]],
    city: ['', Validators.required],
    district: [''],
    gender: ['male' as 'male' | 'female'],
    status: ['active' as PersonStatus],
    vehicle: [''],
    plate: [''],
    specialty: [''],
    experienceYears: [1, [Validators.min(0), Validators.max(50)]],
  });

  private readonly countryId = toSignal(this.form.controls.countryId.valueChanges, { initialValue: '' });
  protected readonly country = computed(() => this.countriesStore.byId(this.countryId()));
  protected readonly cities = computed(() => this.country()?.cities ?? []);

  constructor() {
    // Phone length and city list depend on the selected country.
    this.form.controls.countryId.valueChanges.pipe(takeUntilDestroyed()).subscribe((id) => {
      const c = this.countriesStore.byId(id);
      const phone = this.form.controls.phone;
      phone.setValidators([Validators.required, Validators.pattern(new RegExp(`^\\d{${c?.phoneLength ?? 7},${c?.phoneLength ?? 15}}$`))]);
      phone.updateValueAndValidity({ emitEvent: false });
      if (c && !c.cities.includes(this.form.controls.city.value)) this.form.controls.city.setValue('');
    });

    // Re-seed the form every time the modal opens (create or a different person).
    effect(() => {
      if (!this.open()) return;
      const p = this.person();
      untracked(() => {
        this.saving.set(false);
        this.form.reset({
          // New accounts default to the country currently being viewed.
          countryId: p?.countryId ?? this.scope.country()?.id ?? this.countriesStore.active()[0]?.id ?? '',
          name: p?.name ?? '',
          phone: p?.phone ?? '',
          email: p?.email ?? '',
          city: p?.city ?? '',
          district: p?.district ?? '',
          gender: p?.gender ?? 'male',
          status: p?.status ?? 'active',
          vehicle: p?.vehicle ?? '',
          plate: p?.plate ?? '',
          specialty: p?.specialty ?? SPECIALTIES[0],
          experienceYears: p?.experienceYears ?? 1,
        });
      });
    }, { allowSignalWrites: true });
  }

  protected invalid(name: 'countryId' | 'name' | 'phone' | 'email' | 'city' | 'experienceYears'): boolean {
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
    const kind = this.kind();
    const draft: PersonDraft = {
      countryId: v.countryId,
      name: v.name.trim(),
      phone: v.phone.trim(),
      email: v.email.trim(),
      city: v.city,
      district: v.district.trim(),
      gender: v.gender,
      status: v.status,
      ...(kind === 'drivers' && { vehicle: v.vehicle.trim(), plate: v.plate.trim() }),
      ...(kind === 'technicians' && { specialty: v.specialty, experienceYears: Number(v.experienceYears) }),
    };

    this.saving.set(true);
    // Simulated latency so the saving state is visible — replace with the API call.
    setTimeout(() => {
      const existing = this.person();
      let result: Person;
      if (existing) {
        this.store.update(kind, existing.id, draft);
        result = { ...existing, ...draft };
        this.toast.success(`تم تحديث بيانات ${draft.name} بنجاح`);
      } else {
        result = this.store.create(kind, draft);
        this.toast.success(`تمت إضافة ${draft.name} بنجاح`);
      }
      this.saving.set(false);
      this.saved.emit(result);
      this.closed.emit();
    }, 600);
  }
}
