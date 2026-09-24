import { Injectable, Signal, WritableSignal, inject, signal } from '@angular/core';
import { Person, PersonDraft, PersonHistory, PersonKind, PersonStatus } from './people.models';
import { generateHistory, generatePeople } from './people.mock';
import { CountriesStore } from '../countries/countries.store';

/**
 * In-memory store for customers / drivers / technicians. Accounts are
 * created by the mobile app (self-registration), so the dashboard only
 * reviews, edits, activates/deactivates and deletes them. This is the single
 * seam to replace with `ApiService` calls once the backend exists.
 */
@Injectable({ providedIn: 'root' })
export class PeopleStore {
  private readonly countries = inject(CountriesStore);
  private readonly lists: Record<PersonKind, WritableSignal<Person[]>> = {
    customers: signal(generatePeople('customers', this.countries.all())),
    drivers: signal(generatePeople('drivers', this.countries.all())),
    technicians: signal(generatePeople('technicians', this.countries.all())),
  };
  private readonly historyCache = new Map<string, PersonHistory>();

  list(kind: PersonKind): Signal<Person[]> {
    return this.lists[kind].asReadonly();
  }

  /** Accounts in a country across all kinds (guards country deletion). */
  countIn(countryId: string): number {
    return (Object.keys(this.lists) as PersonKind[]).reduce(
      (acc, k) => acc + this.lists[k]().filter((p) => p.countryId === countryId).length,
      0,
    );
  }

  history(person: Person): PersonHistory {
    let h = this.historyCache.get(person.id);
    if (!h) {
      h = generateHistory(person);
      this.historyCache.set(person.id, h);
    }
    return h;
  }

  update(kind: PersonKind, id: string, draft: Partial<PersonDraft>): void {
    this.lists[kind].update((list) => list.map((p) => (p.id === id ? { ...p, ...draft } : p)));
  }

  setStatus(kind: PersonKind, id: string, status: PersonStatus): void {
    this.update(kind, id, { status });
  }

  remove(kind: PersonKind, id: string): void {
    this.lists[kind].update((list) => list.filter((p) => p.id !== id));
    this.historyCache.delete(id);
  }
}
