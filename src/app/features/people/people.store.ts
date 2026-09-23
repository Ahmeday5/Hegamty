import { Injectable, Signal, WritableSignal, inject, signal } from '@angular/core';
import { Person, PersonActivity, PersonDraft, PersonKind, PersonStatus } from './people.models';
import { PEOPLE_CONFIG } from './people.config';
import { generateActivity, generatePeople } from './people.mock';
import { CountriesStore } from '../countries/countries.store';

/**
 * In-memory store for customers / drivers / technicians. It is the single
 * seam to replace with `ApiService` calls once the backend exists — every
 * page reads through these methods, never the mock generator directly.
 */
@Injectable({ providedIn: 'root' })
export class PeopleStore {
  private readonly countries = inject(CountriesStore);
  /** Fixtures only for markets that are live at startup. */
  private readonly seedCountries = this.countries.active();
  private readonly lists: Record<PersonKind, WritableSignal<Person[]>> = {
    customers: signal(generatePeople('customers', this.seedCountries)),
    drivers: signal(generatePeople('drivers', this.seedCountries)),
    technicians: signal(generatePeople('technicians', this.seedCountries)),
  };
  private readonly activityCache = new Map<string, PersonActivity>();

  list(kind: PersonKind): Signal<Person[]> {
    return this.lists[kind].asReadonly();
  }

  /** How many accounts of each kind a country has (guards country deletion). */
  countIn(countryId: string): number {
    return (Object.keys(this.lists) as PersonKind[]).reduce(
      (acc, k) => acc + this.lists[k]().filter((p) => p.countryId === countryId).length,
      0,
    );
  }

  activity(person: Person): PersonActivity {
    let a = this.activityCache.get(person.id);
    if (!a) {
      a = generateActivity(person, this.countries.symbol(person.countryId));
      this.activityCache.set(person.id, a);
    }
    return a;
  }

  create(kind: PersonKind, draft: PersonDraft): Person {
    const cfg = PEOPLE_CONFIG[kind];
    const nextNo = 1001 + this.lists[kind]().reduce((m, p) => Math.max(m, Number(p.id.split('-')[1]) - 1000), 0);
    const now = new Date().toISOString();
    const person: Person = {
      ...draft,
      id: `${cfg.idPrefix}-${nextNo}`,
      kind,
      bookings: 0,
      completed: 0,
      cancelled: 0,
      balance: 0,
      total: 0,
      rating: 0,
      reviewsCount: 0,
      joinedAt: now,
      lastActiveAt: now,
    };
    this.lists[kind].update((list) => [person, ...list]);
    return person;
  }

  update(kind: PersonKind, id: string, draft: Partial<PersonDraft>): void {
    this.lists[kind].update((list) => list.map((p) => (p.id === id ? { ...p, ...draft } : p)));
  }

  setStatus(kind: PersonKind, id: string, status: PersonStatus): void {
    this.update(kind, id, { status });
  }

  remove(kind: PersonKind, id: string): void {
    this.lists[kind].update((list) => list.filter((p) => p.id !== id));
    this.activityCache.delete(id);
  }
}
