import { ChangeDetectionStrategy, Component, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { ModalComponent } from '../../../../shared/components/modal/modal.component';
import { FormErrorComponent } from '../../../../shared/components/form-error/form-error.component';
import { ToastService } from '../../../../core/services/toast.service';
import { PEOPLE_CONFIG, SPECIALTIES, STATUS_META } from '../../people.config';
import { Person, PersonDraft, PersonKind, PersonStatus } from '../../people.models';
import { PeopleStore } from '../../people.store';
import { CountriesStore } from '../../../countries/countries.store';

/**
 * Edit modal for app-registered accounts (customers, drivers, technicians).
 * There is no create mode — accounts sign up from the mobile app.
 */
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
  readonly person = input<Person | null>(null);
  readonly closed = output<void>();

  private readonly fb = inject(FormBuilder);
  private readonly store = inject(PeopleStore);
  private readonly toast = inject(ToastService);
  private readonly countriesStore = inject(CountriesStore);

  protected readonly countries = this.countriesStore.all;
  protected readonly specialties = SPECIALTIES;
  protected readonly statuses = (Object.keys(STATUS_META) as PersonStatus[]).map((id) => ({ id, label: STATUS_META[id].label }));
  protected readonly saving = signal(false);
  protected readonly cfg = computed(() => PEOPLE_CONFIG[this.kind()]);
  protected readonly title = computed(() => `تعديل بيانات ال${this.cfg().singular}`);

  protected readonly form = this.fb.nonNullable.group({
    countryId: ['', Validators.required],
    name: ['', [Validators.required, Validators.minLength(3)]],
    phone: ['', [Validators.required, Validators.pattern(/^\d{7,15}$/)]],
    email: ['', [Validators.required, Validators.email]],
    city: ['', Validators.required],
    district: [''],
    gender: ['male' as 'male' | 'female'],
    birthDate: ['', Validators.required],
    status: ['active' as PersonStatus],
    nationalId: ['', Validators.pattern(/^\d{6,20}$/)],
    vehicle: [''],
    vehicleColor: [''],
    plate: [''],
    specialty: [''],
    experienceYears: [1, [Validators.min(0), Validators.max(50)]],
  });

  private readonly countryId = toSignal(this.form.controls.countryId.valueChanges, { initialValue: '' });
  protected readonly country = computed(() => this.countriesStore.byId(this.countryId()));
  protected readonly cities = computed(() => this.country()?.cities ?? []);

  constructor() {
    this.form.controls.countryId.valueChanges.pipe(takeUntilDestroyed()).subscribe((id) => {
      const c = this.countriesStore.byId(id);
      if (c && !c.cities.includes(this.form.controls.city.value)) this.form.controls.city.setValue('');
    });

    effect(() => {
      if (!this.open()) return;
      const p = this.person();
      untracked(() => {
        this.saving.set(false);
        this.form.reset({
          countryId: p?.countryId ?? '',
          name: p?.name ?? '',
          phone: p?.phone ?? '',
          email: p?.email ?? '',
          city: p?.city ?? '',
          district: p?.district ?? '',
          gender: p?.gender ?? 'male',
          birthDate: p?.birthDate ?? '',
          status: p?.status ?? 'active',
          nationalId: p?.nationalId ?? '',
          vehicle: p?.vehicle ?? '',
          vehicleColor: p?.vehicleColor ?? '',
          plate: p?.plate ?? '',
          specialty: p?.specialty ?? SPECIALTIES[0],
          experienceYears: p?.experienceYears ?? 1,
        });
      });
    }, { allowSignalWrites: true });
  }

  protected invalid(name: 'countryId' | 'name' | 'phone' | 'email' | 'city' | 'birthDate' | 'nationalId' | 'experienceYears'): boolean {
    const c = this.form.controls[name];
    return c.invalid && c.touched;
  }

  protected submit(): void {
    const existing = this.person();
    if (this.saving() || !existing) return;
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
      birthDate: v.birthDate,
      status: v.status,
      ...(kind !== 'customers' && { nationalId: v.nationalId.trim() }),
      ...(kind === 'drivers' && { vehicle: v.vehicle.trim(), vehicleColor: v.vehicleColor.trim(), plate: v.plate.trim() }),
      ...(kind === 'technicians' && { specialty: v.specialty, experienceYears: Number(v.experienceYears) }),
    };
    this.saving.set(true);
    setTimeout(() => {
      this.store.update(kind, existing.id, draft);
      this.toast.success(`تم تحديث بيانات ${draft.name}`);
      this.saving.set(false);
      this.closed.emit();
    }, 500);
  }
}
