import { Injectable, inject, signal } from '@angular/core';
import { StorageService } from './storage.service';

/** A single entry in the in-memory cache. */
export interface CacheEntry<T = unknown> {
  /** Response body. */
  data: T;
  /** Wall-clock millisecond epoch when the entry was stored. */
  cachedAt: number;
  /** Wall-clock millisecond epoch when the entry expires. */
  expiresAt: number;
}

interface PersistedShape<T = unknown> {
  v: number;
  e: CacheEntry<T>;
}

/** Bumped when the on-disk shape changes — any older entry is ignored. */
const PERSIST_VERSION = 1;
const STORAGE_PREFIX = `app_http_cache_v${PERSIST_VERSION}::`;
const BROADCAST_CHANNEL = 'app-http-cache';
const SWEEP_INTERVAL_MS = 60_000; // garbage-collect expired entries once a minute

type CrossTabMessage =
  | { type: 'set'; key: string }
  | { type: 'invalidate'; pattern: string }
  | { type: 'clear' };

/**
 * Most-recent invalidation event surfaced as a signal so list pages can
 * `effect()` on it and refetch automatically when their data changes
 * elsewhere — including from another tab via BroadcastChannel.
 *
 *   - `pattern`  — the single substring that was invalidated; kept for
 *                  backward compatibility.
 *   - `patterns` — EVERY substring invalidated by the triggering call.
 *                  `invalidateMany()` fires a single event carrying all of
 *                  its patterns instead of one event per pattern — a signal
 *                  write only marks effects dirty (it doesn't run them
 *                  synchronously), so writing once per pattern in a tight
 *                  loop would mean any effect that finally runs only
 *                  observes the LAST pattern written. Always check
 *                  `patterns` (via `onInvalidate`), never just `pattern`.
 *   - `ts`       — wall-clock timestamp; useful as the dependency tick
 *                  even when the same pattern is invalidated repeatedly.
 *
 * Initial value uses `patterns: []` so the first effect run is a no-op.
 */
export interface InvalidationEvent {
  /** @deprecated Use `patterns` — kept only for any direct old readers. */
  pattern: string;
  patterns: readonly string[];
  ts: number;
}

/**
 * Smart HTTP cache.
 *
 *   - In-memory `Map` for O(1) reads.
 *   - localStorage mirror so a hard refresh keeps the cache (TTL respected).
 *   - BroadcastChannel sync so a write in tab A is visible to tab B.
 *   - Background sweep every minute drops expired entries.
 *
 * Mutations call `invalidate(pattern)` (substring match against the cache
 * key) to drop stale slices — e.g. `invalidate('users')` after creating a
 * user removes both the list URL and any per-id URL containing that segment.
 */
@Injectable({ providedIn: 'root' })
export class HttpCacheService {
  private readonly storage = inject(StorageService);
  private readonly mem = new Map<string, CacheEntry>();
  private channel: BroadcastChannel | null = null;

  private readonly invalidationSignal = signal<InvalidationEvent>({
    pattern: '',
    patterns: [],
    ts: 0,
  });
  /**
   * Bumps every time a cache key is invalidated (locally OR from
   * another tab). Pages can effect on this to auto-refetch when their
   * pattern matches — see `core/utils/auto-refresh.util.ts`.
   */
  readonly invalidations = this.invalidationSignal.asReadonly();

  constructor() {
    this.hydrateFromStorage();
    this.initCrossTabSync();
    this.scheduleSweep();
  }

  // ─────────────── public API ───────────────

  get<T>(key: string): T | null {
    const entry = this.mem.get(key) as CacheEntry<T> | undefined;
    if (!entry) return null;
    if (Date.now() >= entry.expiresAt) {
      this.evict(key);
      return null;
    }
    return entry.data;
  }

  set<T>(key: string, data: T, ttlMs: number): void {
    const now = Date.now();
    const entry: CacheEntry<T> = {
      data,
      cachedAt: now,
      expiresAt: now + ttlMs,
    };
    this.mem.set(key, entry as CacheEntry);
    this.persist(key, entry);
    this.broadcast({ type: 'set', key });
  }

  /** Drop every entry whose key contains `pattern` (substring, case-sensitive). */
  invalidate(pattern: string): void {
    if (!pattern) return;
    this.invalidateMany([pattern]);
  }

  /**
   * Drop every entry matching ANY of the given patterns, then fire a
   * SINGLE invalidation event carrying all of them.
   *
   * Must emit exactly one signal write for the whole batch — a signal
   * write only marks dependent effects dirty (Angular coalesces multiple
   * dirty-markings into one flush), so writing once per pattern in a loop
   * would mean any effect that finally runs only observes the LAST write,
   * silently starving `onInvalidate` listeners for every earlier pattern.
   */
  invalidateMany(patterns: readonly string[]): void {
    const clean = patterns.filter(Boolean);
    if (!clean.length) return;

    for (const pattern of clean) {
      for (const key of [...this.mem.keys()]) {
        if (key.includes(pattern)) this.evict(key);
      }
      this.broadcast({ type: 'invalidate', pattern });
    }

    this.invalidationSignal.set({
      pattern: clean[clean.length - 1],
      patterns: clean,
      ts: Date.now(),
    });
  }

  /** Wipe everything — used on logout, role switch, etc. */
  clear(): void {
    for (const key of [...this.mem.keys()]) this.evict(key);
    this.broadcast({ type: 'clear' });
  }

  // ─────────────── persistence ───────────────

  private hydrateFromStorage(): void {
    if (typeof localStorage === 'undefined') return;
    const now = Date.now();
    const toRemove: string[] = [];

    try {
      for (let i = 0; i < localStorage.length; i++) {
        const fullKey = localStorage.key(i);
        if (!fullKey?.startsWith(STORAGE_PREFIX)) continue;
        const raw = localStorage.getItem(fullKey);
        if (!raw) continue;

        try {
          const parsed = JSON.parse(raw) as PersistedShape;
          if (parsed.v !== PERSIST_VERSION) {
            toRemove.push(fullKey);
            continue;
          }
          if (now >= parsed.e.expiresAt) {
            toRemove.push(fullKey);
            continue;
          }
          const cacheKey = fullKey.slice(STORAGE_PREFIX.length);
          this.mem.set(cacheKey, parsed.e);
        } catch {
          toRemove.push(fullKey);
        }
      }
    } catch {
      /* localStorage disabled / quota / SecurityError — ignore */
    }

    for (const k of toRemove) {
      try { localStorage.removeItem(k); } catch { /* ignore */ }
    }
  }

  private persist(key: string, entry: CacheEntry): void {
    const fullKey = STORAGE_PREFIX + key;
    const payload: PersistedShape = { v: PERSIST_VERSION, e: entry };
    try {
      this.storage.set(fullKey, JSON.stringify(payload));
    } catch {
      // Quota exceeded — purge oldest persisted entries to make room.
      this.evictOldestPersisted(20);
      try { this.storage.set(fullKey, JSON.stringify(payload)); } catch { /* give up */ }
    }
  }

  private evict(key: string): void {
    this.mem.delete(key);
    this.storage.remove(STORAGE_PREFIX + key);
  }

  private evictOldestPersisted(count: number): void {
    if (typeof localStorage === 'undefined') return;
    const entries: { key: string; cachedAt: number }[] = [];
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const fullKey = localStorage.key(i);
        if (!fullKey?.startsWith(STORAGE_PREFIX)) continue;
        const raw = localStorage.getItem(fullKey);
        if (!raw) continue;
        try {
          const parsed = JSON.parse(raw) as PersistedShape;
          entries.push({ key: fullKey, cachedAt: parsed.e.cachedAt });
        } catch {
          /* ignore */
        }
      }
    } catch {
      return;
    }
    entries.sort((a, b) => a.cachedAt - b.cachedAt);
    for (const { key } of entries.slice(0, count)) {
      try { localStorage.removeItem(key); } catch { /* ignore */ }
    }
  }

  // ─────────────── cross-tab ───────────────

  private initCrossTabSync(): void {
    if (typeof BroadcastChannel === 'undefined') return;
    try {
      this.channel = new BroadcastChannel(BROADCAST_CHANNEL);
      this.channel.onmessage = (e) =>
        this.onCrossTabMessage(e.data as CrossTabMessage);
    } catch {
      this.channel = null;
    }
  }

  private onCrossTabMessage(msg: CrossTabMessage): void {
    if (!msg || typeof msg !== 'object') return;

    if (msg.type === 'clear') {
      // Mirror the wipe locally — but DON'T re-broadcast, that would loop.
      for (const key of [...this.mem.keys()]) {
        this.mem.delete(key);
        this.storage.remove(STORAGE_PREFIX + key);
      }
      return;
    }

    if (msg.type === 'invalidate') {
      for (const key of [...this.mem.keys()]) {
        if (key.includes(msg.pattern)) {
          this.mem.delete(key);
          this.storage.remove(STORAGE_PREFIX + key);
        }
      }
      // Mirror locally so subscribed pages refetch on the cross-tab event.
      this.invalidationSignal.set({
        pattern: msg.pattern,
        patterns: [msg.pattern],
        ts: Date.now(),
      });
      return;
    }

    if (msg.type === 'set') {
      // Re-read the entry from storage so this tab picks up the new payload.
      const raw = this.storage.get(STORAGE_PREFIX + msg.key);
      if (!raw) return;
      try {
        const parsed = JSON.parse(raw) as PersistedShape;
        if (parsed.v === PERSIST_VERSION && Date.now() < parsed.e.expiresAt) {
          this.mem.set(msg.key, parsed.e);
        }
      } catch {
        /* ignore */
      }
    }
  }

  private broadcast(msg: CrossTabMessage): void {
    try {
      this.channel?.postMessage(msg);
    } catch {
      /* channel closed — ignore */
    }
  }

  // ─────────────── background sweep ───────────────

  private scheduleSweep(): void {
    if (typeof window === 'undefined') return;
    setInterval(() => this.sweepExpired(), SWEEP_INTERVAL_MS);
  }

  private sweepExpired(): void {
    const now = Date.now();
    for (const [key, entry] of this.mem.entries()) {
      if (now >= entry.expiresAt) this.evict(key);
    }
  }
}
