import { Injectable, Signal, inject, signal } from '@angular/core';
import { PeopleStore } from '../people/people.store';
import { ServicesStore } from '../services/services.store';
import { CountriesStore } from '../countries/countries.store';
import { Person } from '../people/people.models';
import { ClinicService } from '../services/services.models';
import { hash, int, pick, rng } from '../../shared/utils/random.util';
import {
  BookingDraft,
  BookingEvent,
  BookingRecord,
  BookingStatus,
  PaymentStatus,
  paymentMethodsFor,
} from './bookings.models';

const DAY = 86400000;
const HOUR = 3600000;
const FIXTURE_COUNT = 520;
const BRANCHES = ['الفرع الرئيسي', 'فرع الشمال', 'فرع الجنوب', 'فرع الشرق', 'فرع الغرب'];
const NOTES = [
  '',
  '',
  '',
  'العميل يفضّل فنيًا بنفس الجنس.',
  'يعاني من ضغط منخفض، يرجى الانتباه.',
  'أول جلسة للعميل، يحتاج شرحًا مفصلًا.',
  'الوصول قبل الموعد بعشر دقائق.',
];

const STATUS_EVENT: Record<BookingStatus, BookingEvent['kind']> = {
  scheduled: 'confirmed',
  in_progress: 'started',
  completed: 'completed',
  cancelled: 'cancelled',
};
const STATUS_TEXT: Record<BookingStatus, string> = {
  scheduled: 'تم تأكيد الحجز وجدولة الموعد',
  in_progress: 'بدأ الفني الجلسة',
  completed: 'اكتملت الجلسة بنجاح',
  cancelled: 'تم إلغاء الحجز',
};

function totals(price: number, homeFee: number, discount: number, vatRate: number) {
  const subtotal = Math.max(0, price + homeFee - discount);
  const vat = Math.round(subtotal * vatRate);
  return { vat, total: subtotal + vat };
}

/**
 * Bookings store. Fixtures are generated per country from the live people
 * and services stores — a booking's customer, technician, driver and
 * service always share its country, and its VAT/currency are that
 * country's.
 */
@Injectable({ providedIn: 'root' })
export class BookingsStore {
  private readonly people = inject(PeopleStore);
  private readonly services = inject(ServicesStore);
  private readonly countries = inject(CountriesStore);
  private readonly items = signal<BookingRecord[]>(this.generate());

  readonly all: Signal<BookingRecord[]> = this.items.asReadonly();

  byId(id: string): BookingRecord | undefined {
    return this.items().find((b) => b.id === id);
  }

  countIn(countryId: string): number {
    return this.items().filter((b) => b.countryId === countryId).length;
  }

  create(draft: BookingDraft): BookingRecord {
    const now = new Date().toISOString();
    const next = Math.max(...this.items().map((b) => Number(b.id.split('-')[1])), 50000) + 1;
    const booking = this.resolve(`BK-${next}`, draft, now);
    booking.events = [
      { id: 'e0', kind: 'created', text: 'تم إنشاء الحجز من لوحة التحكم', date: now },
      { id: 'e1', kind: 'assigned', text: `تم تعيين الفني ${booking.technicianName}`, date: now },
    ];
    this.items.update((list) => [booking, ...list]);
    return booking;
  }

  update(id: string, draft: BookingDraft): void {
    const now = new Date().toISOString();
    this.items.update((list) =>
      list.map((b) => {
        if (b.id !== id) return b;
        const next = this.resolve(b.id, draft, b.createdAt);
        return {
          ...next,
          paymentStatus: b.paymentStatus,
          rating: b.rating,
          events: [{ id: `e${Date.now()}`, kind: 'updated', text: 'تم تعديل بيانات الحجز', date: now }, ...b.events],
        };
      }),
    );
  }

  setStatus(id: string, status: BookingStatus): void {
    const now = new Date().toISOString();
    this.items.update((list) =>
      list.map((b) => {
        if (b.id !== id) return b;
        const paymentStatus: PaymentStatus =
          status === 'cancelled' && b.paymentStatus === 'paid' ? 'refunded' : status === 'completed' ? 'paid' : b.paymentStatus;
        return {
          ...b,
          status,
          paymentStatus,
          events: [{ id: `e${Date.now()}`, kind: STATUS_EVENT[status], text: STATUS_TEXT[status], date: now }, ...b.events],
        };
      }),
    );
  }

  markPaid(id: string): void {
    const now = new Date().toISOString();
    this.items.update((list) =>
      list.map((b) =>
        b.id === id
          ? {
              ...b,
              paymentStatus: 'paid',
              events: [
                { id: `e${Date.now()}`, kind: 'payment', text: `تم تسجيل الدفع بقيمة ${b.total} ${this.countries.symbol(b.countryId)}`, date: now },
                ...b.events,
              ],
            }
          : b,
      ),
    );
  }

  remove(id: string): void {
    this.items.update((list) => list.filter((b) => b.id !== id));
  }

  // ─────────── internals ───────────

  /** Denormalizes a draft into a full record (names, prices, country VAT, totals). */
  private resolve(id: string, d: BookingDraft, createdAt: string): BookingRecord {
    const customer = this.people.list('customers')().find((p) => p.id === d.customerId);
    const tech = this.people.list('technicians')().find((p) => p.id === d.technicianId);
    const driver = d.location === 'home' ? this.people.list('drivers')().find((p) => p.id === d.driverId) : undefined;
    const service = this.services.byId(d.serviceId);
    const vatRate = this.countries.vat(d.countryId);
    const price = service?.price ?? 0;
    const homeFee = d.location === 'home' ? (service?.homeFee ?? 0) : 0;
    const { vat, total } = totals(price, homeFee, d.discount, vatRate);
    return {
      id,
      countryId: d.countryId,
      vatRate,
      customerId: d.customerId,
      customerName: customer?.name ?? '—',
      customerPhone: customer?.phone ?? '',
      technicianId: d.technicianId,
      technicianName: tech?.name ?? '—',
      driverId: driver?.id,
      driverName: driver?.name,
      serviceId: d.serviceId,
      serviceName: service?.name ?? '—',
      date: d.date,
      durationMin: service?.durationMin ?? 30,
      location: d.location,
      address: d.address,
      city: customer?.city ?? '',
      price,
      homeFee,
      discount: d.discount,
      vat,
      total,
      paymentMethod: d.paymentMethod,
      paymentStatus: 'pending',
      status: d.status,
      notes: d.notes,
      createdAt,
      events: [],
    };
  }

  private generate(): BookingRecord[] {
    const byCountry = <T extends { countryId: string }>(list: T[]) => {
      const map = new Map<string, T[]>();
      for (const x of list) map.set(x.countryId, [...(map.get(x.countryId) ?? []), x]);
      return map;
    };
    const customers = this.people.list('customers')().filter((c) => c.status !== 'pending');
    const techs = byCountry(this.people.list('technicians')().filter((t) => t.status === 'active'));
    const drivers = byCountry(this.people.list('drivers')().filter((t) => t.status === 'active'));
    const services = byCountry(this.services.all().filter((s) => s.active));

    // Only customers whose market can actually serve a booking.
    const bookable = customers.filter((c) => techs.get(c.countryId)?.length && services.get(c.countryId)?.length);
    if (!bookable.length) return [];

    const r = rng(hash('bookings-v2'));
    const now = Date.now();
    const list: BookingRecord[] = [];

    for (let i = 0; i < FIXTURE_COUNT; i++) {
      const customer = pick(r, bookable);
      const country = customer.countryId;
      const tech = pick(r, techs.get(country)!) as Person;
      const service = pick(r, services.get(country)!) as ClinicService;
      const driverPool = drivers.get(country) ?? [];
      const home = service.homeVisit && driverPool.length > 0 && r() < 0.45;
      const driver = home ? pick(r, driverPool) : undefined;
      const vatRate = this.countries.vat(country);

      // Skewed towards recent days (growth curve), ~2 weeks ahead, 9:00–22:00.
      const offset = r() < 0.06 ? int(r, 1, 14) : -Math.floor(Math.pow(r(), 1.6) * 365);
      const day = new Date(now + offset * DAY);
      day.setHours(int(r, 9, 22), r() < 0.5 ? 0 : 30, 0, 0);
      let start = day.getTime();
      if (i < 5) start = now - int(r, 5, 40) * 60000; // a few live sessions right now

      const minutesAgo = (now - start) / 60000;
      const status: BookingStatus =
        start > now ? (r() < 0.08 ? 'cancelled' : 'scheduled')
          : minutesAgo < service.durationMin ? 'in_progress'
            : r() < 0.09 ? 'cancelled' : 'completed';

      const discount = r() < 0.22 ? Math.round((service.price * int(r, 5, 20)) / 100) : 0;
      const homeFee = home ? service.homeFee : 0;
      const { vat, total } = totals(service.price, homeFee, discount, vatRate);
      const paymentStatus: PaymentStatus =
        status === 'completed' ? 'paid'
          : status === 'cancelled' ? (r() < 0.6 ? 'refunded' : 'pending')
            : r() < 0.55 ? 'paid' : 'pending';
      // Always in the past, even for bookings scheduled weeks ahead.
      const createdAt = Math.min(start - int(r, 1, 10) * DAY, now - int(r, 2, 72) * HOUR) - int(r, 1, 50) * 60000;
      const symbol = this.countries.symbol(country);

      const events: BookingEvent[] = [
        { id: 'e0', kind: 'created', text: `أنشأ ${customer.name.split(' ')[0]} الحجز من التطبيق`, date: new Date(createdAt).toISOString() },
        { id: 'e1', kind: 'confirmed', text: 'تم تأكيد الحجز تلقائيًا', date: new Date(createdAt + 4 * 60000).toISOString() },
        { id: 'e2', kind: 'assigned', text: `تم تعيين الفني ${tech.name}`, date: new Date(createdAt + 20 * 60000).toISOString() },
      ];
      if (paymentStatus !== 'pending') {
        events.push({ id: 'e3', kind: 'payment', text: `تم الدفع بقيمة ${total} ${symbol}`, date: new Date(createdAt + 25 * 60000).toISOString() });
      }
      if (status === 'in_progress' || status === 'completed') {
        events.push({ id: 'e4', kind: 'started', text: 'بدأ الفني الجلسة', date: new Date(start).toISOString() });
      }
      if (status === 'completed') {
        events.push({ id: 'e5', kind: 'completed', text: 'اكتملت الجلسة بنجاح', date: new Date(start + service.durationMin * 60000).toISOString() });
      }
      if (status === 'cancelled') {
        events.push({ id: 'e6', kind: 'cancelled', text: 'ألغى العميل الحجز', date: new Date(Math.min(start, now) - 2 * HOUR).toISOString() });
      }

      list.push({
        id: `BK-${49000 - i * 3}`,
        countryId: country,
        vatRate,
        customerId: customer.id,
        customerName: customer.name,
        customerPhone: customer.phone,
        technicianId: tech.id,
        technicianName: tech.name,
        driverId: driver?.id,
        driverName: driver?.name,
        serviceId: service.id,
        serviceName: service.name,
        date: new Date(start).toISOString(),
        durationMin: service.durationMin,
        location: home ? 'home' : 'clinic',
        address: home ? `${customer.city}، حي ${customer.district}` : `${pick(r, BRANCHES)} — ${customer.city}`,
        city: customer.city,
        price: service.price,
        homeFee,
        discount,
        vat,
        total,
        paymentMethod: pick(r, paymentMethodsFor(country)),
        paymentStatus,
        status,
        notes: pick(r, NOTES),
        rating: status === 'completed' && r() < 0.7 ? int(r, 4, 5) : undefined,
        createdAt: new Date(createdAt).toISOString(),
        events: events.reverse(),
      });
    }
    return list.sort((a, b) => +new Date(b.date) - +new Date(a.date));
  }
}
