import { Injectable, inject } from '@angular/core';
import { PersonHistory } from '../people/people.models';
import { generateHistory } from '../people/people.mock';
import { PeopleStore } from '../people/people.store';
import { DemoSubscriptionsStore } from '../packages/demo-subscriptions.store';
import { SubscriptionSummary } from '../packages/packages.models';
import { hash, int, rng } from '../../shared/utils/random.util';

export type PreviewKind = 'customers' | 'technicians';

/** Activity figures + history shown in sections whose endpoints don't exist yet. */
export interface ActivityPreview {
  total: number;
  completed: number;
  cancelled: number;
  reviewsCount: number;
  rating: number;
  /** 0–100. */
  completionRate: number;
  history: PersonHistory;
}

/**
 * Demo data for account sections the backend doesn't serve yet (bookings /
 * sessions, reviews, notifications, subscription). Seeded by the real account
 * id, so a profile shows the same figures on every visit. Every view of it is
 * labelled "قيد التطوير" — replace each method with an API call as its
 * endpoint lands, then delete this service.
 */
@Injectable({ providedIn: 'root' })
export class AccountPreviewService {
  private readonly people = inject(PeopleStore);
  private readonly packages = inject(DemoSubscriptionsStore);
  private readonly cache = new Map<string, ActivityPreview>();

  activity(kind: PreviewKind, accountId: string): ActivityPreview {
    const key = `${kind}:${accountId}`;
    let preview = this.cache.get(key);
    if (!preview) {
      preview = this.generate(kind, key);
      this.cache.set(key, preview);
    }
    return preview;
  }

  /** A demo subscription borrowed from a seeded technician. */
  subscription(technicianId: string): SubscriptionSummary {
    const subscribed = this.people.list('technicians')().filter((t) => !!this.packages.latestFor(t.id));
    const donor = subscribed.length ? subscribed[hash(`technicians:${technicianId}`) % subscribed.length] : null;
    return this.packages.summaryFor(donor?.id ?? '');
  }

  private generate(kind: PreviewKind, seed: string): ActivityPreview {
    const r = rng(hash(`${seed}:preview`));
    const total = kind === 'customers' ? int(r, 2, 30) : int(r, 15, 180);
    const cancelled = Math.floor(total * r() * 0.12);
    const completed = Math.max(0, total - cancelled - int(r, 0, 2));
    const rating = +(3.8 + r() * 1.2).toFixed(1);
    const reviewsCount = Math.floor(completed * (0.4 + r() * 0.4));
    return {
      total,
      completed,
      cancelled,
      reviewsCount,
      rating,
      completionRate: total ? Math.round((completed / total) * 100) : 0,
      history: generateHistory({ id: seed, kind, bookings: total, reviewsCount, rating }, null),
    };
  }
}
