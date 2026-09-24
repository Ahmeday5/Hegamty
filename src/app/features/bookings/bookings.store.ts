import { Injectable, Signal, inject, signal } from '@angular/core';
import { PeopleStore } from '../people/people.store';
import { ServicesStore } from '../services/services.store';
import { Person } from '../people/people.models';
import { ClinicService } from '../services/services.models';
import { hash, int, pick, rng } from '../../shared/utils/random.util';
import { BookingEvent, BookingRecord, BookingStatus } from './bookings.models';

const DAY = 86400000;
const MIN = 60000;
const FIXTURE_COUNT = 520;
const NOTES = ['', '', '', 'العميل يفضّل فنيًا بنفس الجنس.', 'يعاني من ضغط منخفض، يرجى الانتباه.', 'أول جلسة للعميل.', 'الدور الثالث بدون مصعد.'];

/**
 * Bookings store (read-mostly — bookings originate in the app). Fixtures
 * are generated per country from the people and services stores, so every
 * party and service a booking references exists in the same country.
 */
@Injectable({ providedIn: 'root' })
export class BookingsStore {
  private readonly people = inject(PeopleStore);
  private readonly services = inject(ServicesStore);
  private readonly items = signal<BookingRecord[]>(this.generate());

  readonly all: Signal<BookingRecord[]> = this.items.asReadonly();

  byId(id: string): BookingRecord | undefined {
    return this.items().find((b) => b.id === id);
  }

  countIn(countryId: string): number {
    return this.items().filter((b) => b.countryId === countryId).length;
  }

  /** Admin intervention — the only status change the dashboard makes. */
  cancel(id: string): void {
    const now = new Date().toISOString();
    this.items.update((list) =>
      list.map((b) => (b.id === id ? { ...b, status: 'cancelled', events: [...b.events, { kind: 'cancelled', date: now }] } : b)),
    );
  }

  remove(id: string): void {
    this.items.update((list) => list.filter((b) => b.id !== id));
  }

  private generate(): BookingRecord[] {
    const byCountry = <T extends { countryId: string }>(list: T[]) => {
      const map = new Map<string, T[]>();
      for (const x of list) map.set(x.countryId, [...(map.get(x.countryId) ?? []), x]);
      return map;
    };
    const techs = byCountry(this.people.list('technicians')().filter((t) => t.status === 'active'));
    const drivers = byCountry(this.people.list('drivers')().filter((t) => t.status === 'active'));
    const services = byCountry(this.services.all().filter((s) => s.active));
    const customers = this.people.list('customers')().filter(
      (c) => c.status === 'active' && techs.get(c.countryId)?.length && services.get(c.countryId)?.length,
    );
    if (!customers.length) return [];

    const r = rng(hash('bookings-v3'));
    const now = Date.now();
    const list: BookingRecord[] = [];

    for (let i = 0; i < FIXTURE_COUNT; i++) {
      const customer = pick(r, customers);
      const country = customer.countryId;
      const tech = pick(r, techs.get(country)!) as Person;
      const service = pick(r, services.get(country)!) as ClinicService;
      const driverPool = drivers.get(country) ?? [];
      const driver = driverPool.length && r() < 0.4 ? pick(r, driverPool) : undefined;

      // Skewed towards recent days (growth curve); a handful happening today.
      const daysAgo = i < 12 ? 0 : Math.floor(Math.pow(r(), 1.6) * 365);
      const day = new Date(now - daysAgo * DAY);
      day.setHours(int(r, 8, 20), r() < 0.5 ? 0 : 30, 0, 0);
      let created = Math.min(day.getTime(), now - int(r, 10, 120) * MIN);

      const duration = service.durationMin ?? 40;
      const accepted = created + int(r, 2, 20) * MIN;
      const started = accepted + int(r, 30, 120) * MIN;
      const completed = started + duration * MIN;

      let status: BookingStatus;
      if (daysAgo === 0 && started > now) status = r() < 0.1 ? 'cancelled' : 'scheduled';
      else if (daysAgo === 0 && completed > now) status = 'in_progress';
      else status = r() < 0.09 ? 'cancelled' : 'completed';
      if (daysAgo === 0 && i < 4 && status === 'completed') {
        created = now - int(r, 60, 90) * MIN; // keep a few sessions live right now
        status = 'in_progress';
      }

      const events: BookingEvent[] = [{ kind: 'created', date: new Date(created).toISOString() }];
      if (status !== 'cancelled' || r() < 0.5) events.push({ kind: 'accepted', date: new Date(accepted).toISOString() });
      if (status === 'in_progress' || status === 'completed') events.push({ kind: 'started', date: new Date(Math.min(started, now - 5 * MIN)).toISOString() });
      if (status === 'completed') events.push({ kind: 'completed', date: new Date(completed).toISOString() });
      if (status === 'cancelled') events.push({ kind: 'cancelled', date: new Date(Math.min(accepted + 15 * MIN, now)).toISOString() });

      list.push({
        id: `BK-${49000 - i * 3}`,
        countryId: country,
        customerId: customer.id,
        customerName: customer.name,
        customerPhone: customer.phone,
        technicianId: tech.id,
        technicianName: tech.name,
        driverId: driver?.id,
        driverName: driver?.name,
        serviceId: service.id,
        serviceName: service.name,
        date: new Date(created).toISOString(),
        durationMin: service.durationMin,
        address: `${customer.city}، حي ${customer.district}`,
        city: customer.city,
        price: service.price,
        status,
        notes: pick(r, NOTES),
        rating: status === 'completed' && r() < 0.7 ? int(r, 4, 5) : undefined,
        events,
      });
    }
    return list.sort((a, b) => +new Date(b.date) - +new Date(a.date));
  }
}
