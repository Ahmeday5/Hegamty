import { effect } from '@angular/core';
import { HttpCacheService } from '../services/http-cache.service';

/**
 * Wires a component/service `effect()` to `HttpCacheService.invalidations()`
 * so a page can refetch automatically whenever any of `patterns` is
 * invalidated elsewhere — including from another browser tab.
 *
 *   constructor() {
 *     onInvalidate(this.httpCache, ['users'], () => this.reload());
 *   }
 *
 * Must be called from an injection context (constructor / field initializer).
 */
export function onInvalidate(
  cache: HttpCacheService,
  patterns: readonly string[],
  refetch: () => void,
): void {
  effect(() => {
    const event = cache.invalidations();
    if (event.patterns.length === 0) return; // initial no-op value
    if (event.patterns.some((p) => patterns.includes(p))) {
      refetch();
    }
  });
}
