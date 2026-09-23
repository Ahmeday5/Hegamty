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
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { ModalComponent } from '../../../../shared/components/modal/modal.component';
import { FormErrorComponent } from '../../../../shared/components/form-error/form-error.component';
import {
  SearchableSelectComponent,
  SearchableSelectOption,
} from '../../../../shared/components/searchable-select/searchable-select.component';
import { IconComponent } from '../../../../shared/components/icon/icon.component';
import { ToastService } from '../../../../core/services/toast.service';
import { PeopleStore } from '../../../people/people.store';
import { BOOKING_META } from '../../../people/people.config';
import { ServicesStore } from '../../../services/services.store';
import { CountriesStore } from '../../../countries/countries.store';
import { CountryScopeService } from '../../../countries/country-scope.service';
import { COUNTRY_PIPES } from '../../../countries/country.pipes';
import { BookingsStore } from '../../bookings.store';
import {
  BookingDraft,
  BookingLocation,
  BookingRecord,
  BookingStatus,
  paymentMethodsFor,
} from '../../bookings.models';

const pad = (n: number) => String(n).padStart(2, '0');

/** Create / edit booking modal with a live price breakdown. */
@Component({
  selector: 'app-booking-form',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, ModalComponent, FormErrorComponent, SearchableSelectComponent, IconComponent, ...COUNTRY_PIPES],
  templateUrl: './booking-form.component.html',
  styleUrl: './booking-form.component.scss',
})
export class BookingFormComponent {
  readonly open = input.required<boolean>();
  /** `null` → create mode. */
  readonly booking = input<BookingRecord | null>(null);
  readonly closed = output<void>();
  readonly saved = output<BookingRecord>();

  private readonly fb = inject(FormBuilder);
  private readonly people = inject(PeopleStore);
  private readonly servicesStore = inject(ServicesStore);
  private readonly store = inject(BookingsStore);
  private readonly toast = inject(ToastService);
  private readonly countriesStore = inject(CountriesStore);
  private readonly scope = inject(CountryScopeService);

  protected readonly countries = this.countriesStore.active;
  protected readonly statuses = (Object.keys(BOOKING_META) as BookingStatus[]).map((id) => ({ id, label: BOOKING_META[id].label }));
  protected readonly saving = signal(false);
  protected readonly title = computed(() => (this.booking() ? `تعديل الحجز ${this.booking()!.id}` : 'حجز جديد'));

  protected readonly form = this.fb.nonNullable.group({
    countryId: ['', Validators.required],
    customerId: ['', Validators.required],
    serviceId: ['', Validators.required],
    technicianId: ['', Validators.required],
    day: ['', Validators.required],
    time: ['', Validators.required],
    location: ['clinic' as BookingLocation],
    driverId: [''],
    address: [''],
    paymentMethod: [''],
    discount: [0, [Validators.min(0), Validators.max(100000)]],
    status: ['scheduled' as BookingStatus],
    notes: [''],
  });

  private readonly value = toSignal(this.form.valueChanges, { initialValue: this.form.getRawValue() });

  // ── Everything below is scoped to the booking's country ──
  protected readonly countryId = computed(() => this.value().countryId ?? '');
  protected readonly country = computed(() => this.countriesStore.byId(this.countryId()));
  protected readonly methods = computed(() => paymentMethodsFor(this.countryId()));
  protected readonly services = computed(() =>
    this.servicesStore.active().filter((s) => s.countryId === this.countryId()),
  );
  protected readonly customerOptions = computed<SearchableSelectOption[]>(() =>
    this.people.list('customers')()
      .filter((p) => p.countryId === this.countryId() && p.status !== 'blocked')
      .map((p) => ({ value: p.id, label: p.name, hint: `${p.phone} · ${p.city}` })),
  );
  protected readonly techOptions = computed<SearchableSelectOption[]>(() =>
    this.people.list('technicians')()
      .filter((p) => p.countryId === this.countryId() && p.status === 'active')
      .map((p) => ({ value: p.id, label: p.name, hint: `${p.specialty} · ${p.city}` })),
  );
  protected readonly driverOptions = computed<SearchableSelectOption[]>(() =>
    this.people.list('drivers')()
      .filter((p) => p.countryId === this.countryId() && p.status === 'active')
      .map((p) => ({ value: p.id, label: p.name, hint: `${p.vehicle} · ${p.city}` })),
  );

  protected readonly selectedService = computed(() => {
    const id = this.value().serviceId;
    return id ? this.servicesStore.byId(id) : undefined;
  });
  protected readonly homeAllowed = computed(() => !!this.selectedService()?.homeVisit);

  protected readonly summary = computed(() => {
    const s = this.selectedService();
    const v = this.value();
    const price = s?.price ?? 0;
    const homeFee = v.location === 'home' ? (s?.homeFee ?? 0) : 0;
    const discount = Math.max(0, Number(v.discount) || 0);
    const subtotal = Math.max(0, price + homeFee - discount);
    const vatRate = this.country()?.vatRate ?? 0;
    const vat = Math.round(subtotal * vatRate);
    return { price, homeFee, discount, vat, vatPct: Math.round(vatRate * 100), total: subtotal + vat };
  });

  constructor() {
    // Changing country clears every country-bound pick.
    this.form.controls.countryId.valueChanges.pipe(takeUntilDestroyed()).subscribe((id) => {
      const f = this.form.controls;
      const inCountry = (kind: 'customers' | 'technicians' | 'drivers', pid: string) =>
        this.people.list(kind)().some((p) => p.id === pid && p.countryId === id);
      if (!inCountry('customers', f.customerId.value)) f.customerId.setValue('');
      if (!inCountry('technicians', f.technicianId.value)) f.technicianId.setValue('');
      if (!inCountry('drivers', f.driverId.value)) f.driverId.setValue('');
      if (this.servicesStore.byId(f.serviceId.value)?.countryId !== id) f.serviceId.setValue('');
      const methods = paymentMethodsFor(id);
      if (!methods.includes(f.paymentMethod.value)) f.paymentMethod.setValue(methods[0]);
    });

    // Driver is required only for home visits; services without home visits force the clinic.
    this.form.controls.location.valueChanges.pipe(takeUntilDestroyed()).subscribe((loc) => {
      const driver = this.form.controls.driverId;
      driver.setValidators(loc === 'home' ? Validators.required : null);
      driver.updateValueAndValidity({ emitEvent: false });
    });
    this.form.controls.serviceId.valueChanges.pipe(takeUntilDestroyed()).subscribe((id) => {
      if (!this.servicesStore.byId(id)?.homeVisit && this.form.controls.location.value === 'home') {
        this.form.controls.location.setValue('clinic');
      }
    });

    effect(() => {
      if (!this.open()) return;
      const b = this.booking();
      untracked(() => this.reset(b));
    }, { allowSignalWrites: true });
  }

  protected setLocation(loc: BookingLocation): void {
    if (loc === 'home' && !this.homeAllowed()) return;
    this.form.controls.location.setValue(loc);
  }

  protected invalid(name: 'countryId' | 'customerId' |'serviceId' | 'technicianId' | 'day' | 'time' | 'driverId' | 'discount'): boolean {
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
    const date = new Date(`${v.day}T${v.time}`).toISOString();
    const customer = this.people.list('customers')().find((p) => p.id === v.customerId);
    const draft: BookingDraft = {
      countryId: v.countryId,
      customerId: v.customerId,
      technicianId: v.technicianId,
      driverId: v.location === 'home' ? v.driverId : undefined,
      serviceId: v.serviceId,
      date,
      location: v.location,
      address:
        v.address.trim() ||
        (v.location === 'home' ? `${customer?.city ?? ''}، حي ${customer?.district ?? ''}` : `الفرع الرئيسي — ${customer?.city ?? ''}`),
      paymentMethod: v.paymentMethod,
      discount: Number(v.discount) || 0,
      notes: v.notes.trim(),
      status: v.status,
    };

    this.saving.set(true);
    // Simulated latency — replace with the API call.
    setTimeout(() => {
      const existing = this.booking();
      let result: BookingRecord;
      if (existing) {
        this.store.update(existing.id, draft);
        result = this.store.byId(existing.id)!;
        this.toast.success(`تم تحديث الحجز ${existing.id} بنجاح`);
      } else {
        result = this.store.create(draft);
        this.toast.success(`تم إنشاء الحجز ${result.id} بنجاح`);
      }
      this.saving.set(false);
      this.saved.emit(result);
      this.closed.emit();
    }, 650);
  }

  private reset(b: BookingRecord | null): void {
    this.saving.set(false);
    const d = b ? new Date(b.date) : new Date(Date.now() + 86400000);
    if (!b) d.setHours(17, 0, 0, 0);
    // countryId is declared first so its change handler runs before the
    // country-bound fields are re-seeded below.
    const countryId = b?.countryId ?? this.scope.country()?.id ?? this.countriesStore.active()[0]?.id ?? '';
    this.form.reset({
      countryId,
      customerId: b?.customerId ?? '',
      serviceId: b?.serviceId ?? '',
      technicianId: b?.technicianId ?? '',
      day: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
      time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
      location: b?.location ?? 'clinic',
      driverId: b?.driverId ?? '',
      address: b?.address ?? '',
      paymentMethod: b?.paymentMethod ?? paymentMethodsFor(countryId)[0],
      discount: b?.discount ?? 0,
      status: b?.status ?? 'scheduled',
      notes: b?.notes ?? '',
    });
  }
}
