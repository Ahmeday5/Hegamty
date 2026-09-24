import { Injectable, NgZone, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, defer, firstValueFrom, from, of, throwError } from 'rxjs';
import {
  catchError,
  delay,
  finalize,
  map,
  share,
  switchMap,
  tap,
} from 'rxjs/operators';
import { environment } from '../../../../environments/environment';
import { ApiService } from '../../services/api.service';
import { StorageService } from '../../services/storage.service';
import { DeviceService } from './device.service';
import { ToastService } from '../../services/toast.service';
import { HttpCacheService } from '../../services/http-cache.service';
import {
  AuthResponseData,
  AuthTokens,
  LoginRequest,
  LogoutRequest,
  RefreshTokenRequest,
  User,
  UserRole,
} from '../models/auth.model';
import { ApiError } from '../../models/api-response.model';
import { AUTH_ENDPOINTS, LOGIN_ROUTE } from '../auth.config';
import {
  withInlineHandling,
  withSkipAuth,
} from '../../http/http-context.tokens';
import { getJwtExpiry } from '../utils/jwt.util';

const USER_KEY = 'app_user';
/** "1" = remember me (localStorage), "0" = this browser session only. */
const REMEMBER_KEY = 'app_remember';
/** Refresh this many ms BEFORE the access token actually expires. */
const REFRESH_BUFFER_MS = 60 * 1000;
/** Lower bound for the proactive refresh timer to avoid timer storms on edge cases. */
const MIN_REFRESH_DELAY_MS = 5_000;
/** Exponential backoff schedule for transient (network/5xx) refresh failures. */
const REFRESH_RETRY_BACKOFF_MS: readonly number[] = [5_000, 15_000, 45_000, 120_000];
/**
 * After a "reuse detected" error we wait briefly to let any winning tab's
 * storage write + BroadcastChannel message arrive, then re-read storage. If a
 * fresh token landed in that window the failure was a benign cross-tab race,
 * not a security event.
 */
const REUSE_RACE_RECHECK_DELAY_MS = 250;
const BROADCAST_CHANNEL_NAME = 'app-auth';
/** Cross-tab/cross-process mutex name for the refresh-token round-trip. */
const REFRESH_LOCK_NAME = 'app-auth-refresh';
/**
 * `setTimeout` stores its delay as a signed 32-bit integer — values above
 * 2^31-1 (~24.8 days) overflow and fire IMMEDIATELY. A long-lived access
 * token (e.g. months) would therefore trigger an instant-refresh loop,
 * which both hammers the backend and trips reuse-detection. We clamp to
 * just under the limit and re-arm on wake if the token is still safe.
 */
const MAX_SETTIMEOUT_DELAY_MS = 2_147_000_000;

/**
 * Statuses that prove the refresh token itself is invalid — anything else
 * (network, CORS, 5xx) is treated as transient and triggers a backoff
 * retry instead of a forced logout.
 */
const AUTH_FATAL_STATUSES: ReadonlySet<number> = new Set([400, 401, 403]);

/**
 * Set of strings your backend uses to signal that a refresh token was
 * already used (rotation/reuse detection). Adjust to match your API, or
 * clear the array to disable reuse-detection handling entirely (every
 * refresh failure is then classified purely by HTTP status).
 */
const REUSE_DETECTED_MARKERS: readonly string[] = ['reuse'];

type CrossTabMessage =
  | { type: 'session-updated'; from: string }
  | { type: 'logged-out'; from: string };

export interface LoginInput {
  email: string;
  password: string;
  rememberMe: boolean;
}

interface LogoutOptions {
  redirect?: boolean;
  callApi?: boolean;
  reason?: string;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly api = inject(ApiService);
  private readonly storage = inject(StorageService);
  private readonly device = inject(DeviceService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);
  private readonly zone = inject(NgZone);
  private readonly httpCache = inject(HttpCacheService);

  private readonly currentUserSignal = signal<User | null>(this.loadStoredUser());
  readonly currentUser = this.currentUserSignal.asReadonly();
  readonly isAuthenticated = computed(() => !!this.currentUserSignal());

  /**
   * Set of permissions the current user holds. Kept as a derived signal so
   * directives / guards can subscribe reactively — when the user logs in
   * (or another tab updates the session) every gated UI element refreshes
   * without manual rewiring.
   */
  readonly permissionSet = computed<ReadonlySet<string>>(
    () => new Set(this.currentUserSignal()?.permissions ?? []),
  );

  /** Shared in-flight refresh — collapses concurrent callers in this tab. */
  private inflightRefresh: Observable<AuthTokens> | null = null;
  private refreshTimerId: ReturnType<typeof setTimeout> | null = null;
  private channel: BroadcastChannel | null = null;
  private hasScheduledLogoutToast = false;
  /** Consecutive transient refresh failures — drives backoff. Reset on success. */
  private refreshFailureStreak = 0;
  /**
   * Set once the session has been declared dead (server-rejected refresh,
   * missing token, etc). Pending callers that race past the logout are
   * short-circuited here so we don't trigger duplicate navigations
   * (which the Angular Router rejects with `InvalidStateError`).
   */
  private sessionDead = false;
  /** Per-tab id so we can ignore our own broadcasts. */
  private readonly tabId =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  constructor() {
    // A session minted by the old UI-only mock login is meaningless to the
    // real API — drop it so the user signs in against the backend.
    if (!environment.mockAuth && this.getRefreshToken()?.startsWith('mock-refresh')) {
      this.clearLocalSession();
    }
    this.initCrossTabSync();
    this.initVisibilityRecovery();
    if (this.isLoggedIn()) {
      this.scheduleProactiveRefresh();
    }
  }

  // ──────────────────────── public API ────────────────────────

  login(input: LoginInput): Observable<User> {
    if (environment.mockAuth) return this.mockLogin(input);

    const dev = this.device.getInfo();
    const payload: LoginRequest = {
      email: input.email.trim(),
      password: input.password,
      rememberMe: input.rememberMe,
      deviceInfo: dev.deviceInfo,
      deviceId: dev.deviceId,
    };

    return this.api
      .post<AuthResponseData>(AUTH_ENDPOINTS.login, payload, {
        context: withInlineHandling(withSkipAuth()),
      })
      .pipe(
        // The login payload carries the full user (id, email, name, role) —
        // there is no separate "me" endpoint to hydrate from.
        map((data) => {
          this.setPersistent(input.rememberMe);
          this.persistSession(data, true);
          return this.currentUserSignal() ?? this.toUser(data);
        }),
      );
  }

  /**
   * UI-only login (`environment.mockAuth`): accepts any credentials and runs
   * a locally minted session through the normal `persistSession` path, so
   * guards, the topbar user and the sidebar behave exactly as with a real
   * backend. The unsigned token carries only an `exp` claim for the refresh
   * scheduler — it is never sent anywhere meaningful.
   */
  private mockLogin(input: LoginInput): Observable<User> {
    const email = input.email.trim();
    const expSec = Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60;
    const b64url = (obj: object) =>
      btoa(JSON.stringify(obj)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
    const accessToken = `${b64url({ alg: 'none', typ: 'JWT' })}.${b64url({ sub: 'mock-user', exp: expSec })}.mock`;

    const data: AuthResponseData = {
      accessToken,
      refreshToken: `mock-refresh-${Date.now()}`,
      userId: 'mock-user',
      email,
      userName: email.split('@')[0] || 'مستخدم',
      role: 'Admin',
      permissions: ['Users.Manage'],
      expiresAtUtc: new Date(expSec * 1000).toISOString(),
    };

    // Small delay so the button's loading state is visible, like a real call.
    return of(data).pipe(
      delay(700),
      tap((d) => this.persistSession(d, true)),
      map((d) => this.toUser(d)),
    );
  }

  // ─────────── token storage ("remember me") ───────────
  // Remembered sessions live in localStorage (survive restarts, shared by
  // tabs); otherwise in sessionStorage (gone when the browser closes). Reads
  // check both so a mode switch never strands a session.

  private isPersistent(): boolean {
    return this.storage.get(REMEMBER_KEY) !== '0';
  }

  private setPersistent(persistent: boolean): void {
    this.storage.set(REMEMBER_KEY, persistent ? '1' : '0');
  }

  private readKey(key: string): string | null {
    return this.storage.get(key) ?? this.storage.getSession(key);
  }

  private writeKey(key: string, value: string): void {
    if (this.isPersistent()) {
      this.storage.set(key, value);
      this.storage.removeSession(key);
    } else {
      this.storage.setSession(key, value);
      this.storage.remove(key);
    }
  }

  private removeKey(key: string): void {
    this.storage.remove(key);
    this.storage.removeSession(key);
  }

  logout(opts: LogoutOptions = {}): void {
    // Mark dead immediately so any concurrent 401/refresh attempts are
    // silently short-circuited — prevents spurious "session expired" toasts
    // on an intentional logout.
    this.sessionDead = true;

    const { redirect = true, callApi = true, reason } = opts;
    const refreshToken = this.getRefreshToken();

    if (callApi && refreshToken && !environment.mockAuth) {
      const payload: LogoutRequest = { refreshToken };
      // Fire-and-forget — never block redirect on the network roundtrip.
      // SKIP_AUTH + a manual header: the auth interceptor must NOT try to
      // refresh an expired access token here — that would rotate the very
      // refresh token we're about to revoke.
      const access = this.getAccessToken();
      this.api
        .post<unknown>(AUTH_ENDPOINTS.logout, payload, {
          context: withInlineHandling(withSkipAuth()),
          headers: access ? { Authorization: `Bearer ${access}` } : undefined,
        })
        .subscribe({ error: () => {} });
    }

    this.clearLocalSession();
    this.broadcast({ type: 'logged-out', from: this.tabId });

    if (reason) this.toast.warning(reason);
    if (redirect) this.navigateToLogin();
  }

  /**
   * Safe wrapper around `router.navigate([LOGIN_ROUTE])`. Skips the call
   * when we're already on the login route (avoids a redundant navigation
   * that the Router rejects with `InvalidStateError` when a previous
   * navigation is still resolving).
   */
  private navigateToLogin(): void {
    const url = this.router.url ?? '';
    if (url.startsWith(LOGIN_ROUTE)) return;
    this.router.navigateByUrl(LOGIN_ROUTE).catch(() => {
      /* Navigation rejected (e.g. concurrent navigation already in
       * progress) — the other navigation will land the user on the login
       * page, so swallowing here is correct. */
    });
  }

  /**
   * Issues a refresh-token request, serialized across **all tabs** via the Web
   * Locks API and collapsed across concurrent in-tab callers via shared
   * observable. The lock body re-reads storage first: if another tab already
   * rotated the token while we were waiting, we skip the network entirely.
   */
  refreshToken(): Observable<AuthTokens> {
    if (this.inflightRefresh) return this.inflightRefresh;

    // Session was already declared dead — don't try to refresh, and
    // crucially don't trigger another logout/redirect (the first one
    // already happened, the second one races Angular's navigation).
    if (this.sessionDead) {
      return throwError(() => this.makeAuthError('انتهت الجلسة'));
    }

    // Race shortcut (no lock needed): another tab may have already refreshed
    // and the new tokens are sitting in storage right now.
    const fromAnotherTab = this.readFreshTokens();
    if (fromAnotherTab) {
      this.scheduleProactiveRefresh();
      return of(fromAnotherTab);
    }

    this.inflightRefresh = this.runUnderRefreshLock().pipe(
      finalize(() => {
        this.inflightRefresh = null;
      }),
      share()
    );

    return this.inflightRefresh;
  }

  getAccessToken(): string | null {
    return this.readKey(environment.tokenKey);
  }

  getRefreshToken(): string | null {
    return this.readKey(environment.refreshTokenKey);
  }

  isLoggedIn(): boolean {
    return !!this.getAccessToken() && !!this.getRefreshToken();
  }

  hasRole(role: UserRole): boolean {
    return this.currentUserSignal()?.role === role;
  }

  hasAnyRole(roles: ReadonlyArray<UserRole>): boolean {
    const current = this.currentUserSignal()?.role;
    return !!current && roles.includes(current);
  }

  /**
   * Returns true when the user holds **every** permission in the input.
   * Accepts a single permission or an array — array form is "all of".
   *
   * For "any of" semantics use {@link hasAnyPermission}.
   */
  hasPermission(permission: string | readonly string[]): boolean {
    const set = this.permissionSet();
    if (Array.isArray(permission)) {
      return permission.every((p) => set.has(p));
    }
    return set.has(permission as string);
  }

  /** Returns true when the user holds AT LEAST ONE of the given permissions. */
  hasAnyPermission(permissions: readonly string[]): boolean {
    if (permissions.length === 0) return true;
    const set = this.permissionSet();
    return permissions.some((p) => set.has(p));
  }

  // ──────────────────────── refresh pipeline ────────────────────────

  /**
   * Wraps the refresh round-trip in a Web Lock so only ONE tab in the entire
   * browser profile is in flight at a time. Inside the lock we re-check
   * storage — the tab that held the lock before us may have already rotated.
   */
  private runUnderRefreshLock(): Observable<AuthTokens> {
    const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined;

    // Web Locks unsupported (older browsers, non-browser env) — fall back to
    // the in-tab guard only. This loses cross-tab safety but the runtime
    // already discounts that environment.
    if (!locks) return this.executeRefresh();

    return defer(() =>
      from(
        locks.request(REFRESH_LOCK_NAME, () => {
          // Inside the lock: did the previous holder already refresh?
          const fresh = this.readFreshTokens();
          if (fresh) {
            this.scheduleProactiveRefresh();
            return Promise.resolve(fresh);
          }
          // `locks.request` holds the lock until the returned promise settles,
          // so awaiting the observable here is exactly what we want.
          return firstValueFrom(this.executeRefresh());
        })
      ).pipe(
        catchError((err) => {
          // `navigator.locks.request` can reject with `InvalidStateError`
          // when the page is being unloaded (or the lock manager is in an
          // unrecoverable state). The request that triggered the refresh
          // is also being torn down, so propagating a quiet auth error is
          // the right call — nothing useful can act on it.
          if ((err as DOMException | undefined)?.name === 'InvalidStateError') {
            return throwError(() => this.makeAuthError('تم إلغاء تجديد الجلسة'));
          }
          return throwError(() => err);
        })
      )
    );
  }

  /** The actual network call + post-processing. Always runs under a held lock. */
  private executeRefresh(): Observable<AuthTokens> {
    const refreshToken = this.getRefreshToken();
    if (!refreshToken) {
      this.scheduleSessionExpiredLogout();
      return throwError(() => this.makeAuthError('انتهت الجلسة'));
    }

    const dev = this.device.getInfo();
    const payload: RefreshTokenRequest = {
      refreshToken,
      deviceInfo: dev.deviceInfo,
      deviceId: dev.deviceId,
    };

    return this.api
      .post<AuthResponseData>(AUTH_ENDPOINTS.refresh, payload, {
        context: withInlineHandling(withSkipAuth()),
      })
      .pipe(
        // Persist + return the SAME tokens in one step. A 2xx refresh must
        // never be discarded: if the backend doesn't rotate the refresh
        // token (returns only a new access token) we keep the existing one
        // instead of throwing — otherwise the next attempt sends a token the
        // server already consumed and we get a self-inflicted 401 → logout.
        map((data) => this.persistSession(data, false)),
        catchError((err) => this.recoverOrFail(err))
      );
  }

  /**
   * Decides between three outcomes for a failed refresh:
   *
   *  1. Reuse-detected — could be either a race or a real attack. Wait a beat
   *     and re-read storage; if a fresher token landed, treat as race and
   *     succeed. Otherwise treat as fatal.
   *  2. Auth-fatal (400/401/403) — the server explicitly rejected us. Kill
   *     the session.
   *  3. Transient (network, CORS, 5xx) — server didn't disown the token, we
   *     just couldn't reach it. Backoff + retry; keep session alive.
   */
  private recoverOrFail(err: unknown): Observable<AuthTokens> {
    // Cheap pre-check: another tab may have already broadcasted a refresh by
    // the time the failure landed. Skip the wait when possible.
    const immediate = this.readFreshTokens();
    if (immediate) {
      this.refreshFailureStreak = 0;
      this.scheduleProactiveRefresh();
      return of(immediate);
    }

    if (this.isReuseDetected(err)) {
      return of(null).pipe(
        delay(REUSE_RACE_RECHECK_DELAY_MS),
        switchMap(() => {
          const recovered = this.readFreshTokens();
          if (recovered) {
            this.refreshFailureStreak = 0;
            this.scheduleProactiveRefresh();
            return of(recovered);
          }
          // Genuine reuse — token family is dead server-side, session is gone.
          this.scheduleSessionExpiredLogout();
          return throwError(() => err);
        })
      );
    }

    if (this.isAuthFatal(err)) {
      this.scheduleSessionExpiredLogout();
      return throwError(() => err);
    }

    this.scheduleRefreshRetry();
    return throwError(() => err);
  }

  /**
   * Server-signaled "your refresh token was already used". Checks
   * `REUSE_DETECTED_MARKERS` against the error body's `details`/`message` —
   * adjust that list (in this file's constants) to match your backend's
   * actual reuse-detection error shape, or clear it to disable this path.
   */
  private isReuseDetected(err: unknown): boolean {
    if (REUSE_DETECTED_MARKERS.length === 0) return false;
    const body = (err as { error?: { details?: string; message?: string } } | null)?.error;
    const raw = (err as { raw?: { details?: string; message?: string } } | null)?.raw;
    const haystacks = [body?.details, body?.message, raw?.details, raw?.message]
      .filter((s): s is string => typeof s === 'string')
      .map((s) => s.toLowerCase());
    return haystacks.some((s) => REUSE_DETECTED_MARKERS.some((marker) => s.includes(marker)));
  }

  // ────────────────────── persistence ──────────────────────

  /**
   * @param updateUser whether to overwrite the cached user from this response.
   *   `true` for /login (full payload), `false` for /refresh (user fields can
   *   come back empty and would clobber the real values).
   */
  private persistSession(
    data: AuthResponseData,
    updateUser: boolean,
  ): AuthTokens {
    // On the refresh path, tolerate a backend that doesn't rotate the
    // refresh token: fall back to the one already in storage so a
    // successful 2xx is never thrown away. Login always returns both.
    const fallbackRefreshToken = updateUser ? null : this.getRefreshToken();
    const tokens = this.extractTokens(data, fallbackRefreshToken);
    this.writeKey(environment.tokenKey, tokens.accessToken);
    this.writeKey(environment.refreshTokenKey, tokens.refreshToken);

    if (updateUser && data.userId) {
      const user = this.toUser(data);
      this.writeKey(USER_KEY, JSON.stringify(user));
      this.currentUserSignal.set(user);
    } else if (!this.currentUserSignal()) {
      // Stale tab booting up after a previous refresh — rehydrate the user
      // we already have on disk so guards / role checks work immediately.
      const stored = this.loadStoredUser();
      if (stored) this.currentUserSignal.set(stored);
    }

    this.refreshFailureStreak = 0;
    this.sessionDead = false;
    this.broadcast({ type: 'session-updated', from: this.tabId });
    this.scheduleProactiveRefresh();
    return tokens;
  }

  private clearLocalSession(): void {
    this.removeKey(environment.tokenKey);
    this.removeKey(environment.refreshTokenKey);
    this.removeKey(USER_KEY);
    this.currentUserSignal.set(null);
    this.cancelScheduledRefresh();
    this.inflightRefresh = null;
    this.refreshFailureStreak = 0;
    // Wipe the HTTP cache — leftover entries belong to the previous user
    // and would leak into the next session.
    this.httpCache.clear();
  }

  private loadStoredUser(): User | null {
    if (!this.getAccessToken() || !this.getRefreshToken()) return null;
    const raw = this.readKey(USER_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as User;
    } catch {
      return null;
    }
  }

  // ────────────────────── mappers ──────────────────────

  /**
   * @param fallbackRefreshToken used only on the refresh path: when the
   *   backend returns a new access token but no rotated refresh token, we
   *   keep the existing one rather than failing the whole session. A missing
   *   **access** token on a 2xx response is the only unrecoverable case.
   */
  private extractTokens(
    data: AuthResponseData,
    fallbackRefreshToken?: string | null,
  ): AuthTokens {
    const accessToken = data?.accessToken;
    if (!accessToken) {
      throw new Error('استجابة غير صالحة من الخادم (رمز الدخول مفقود)');
    }
    const refreshToken = data?.refreshToken || fallbackRefreshToken || null;
    if (!refreshToken) {
      throw new Error('استجابة غير صالحة من الخادم (رمز التجديد مفقود)');
    }
    return {
      accessToken,
      refreshToken,
      expiresAt: this.resolveExpiry(accessToken, data.expiresAtUtc),
    };
  }

  private toUser(data: AuthResponseData): User {
    // The API echoes the email as `userName` — show its local part instead.
    const rawName = data.userName?.trim() ?? '';
    const userName = (rawName && !rawName.includes('@') ? rawName : '') || (rawName || data.email || '').split('@')[0] || 'مستخدم';
    const role = this.normalizeRole(data.role);
    return {
      id: data.userId,
      name: userName,
      email: data.email ?? '',
      role,
      avatar: this.deriveAvatar(userName),
      permissions: this.resolvePermissions(data.permissions),
    };
  }

  /**
   * Normalizes whatever role string the backend returns. Replace with a
   * lookup against your own `UserRole` union if roles need case/alias
   * mapping (see the commented example) — otherwise this passes the raw
   * value straight through.
   *
   *   const map: Record<string, UserRole> = { admin: 'Admin', staff: 'Staff' };
   *   return map[(raw ?? '').trim().toLowerCase()] ?? 'Client';
   */
  private normalizeRole(raw: string | null | undefined): UserRole {
    return (raw ?? '').trim();
  }

  /**
   * Resolves the effective permission list for a user. Trusts the backend's
   * `permissions` array verbatim when present. If your app needs a
   * role→permissions fallback for backends that omit the array, add a
   * static map and look it up here by `role`.
   */
  private resolvePermissions(
    fromWire: ReadonlyArray<string> | null | undefined,
  ): string[] {
    return fromWire ? [...fromWire] : [];
  }

  private deriveAvatar(name: string): string {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return '?';
    if (parts.length === 1) return parts[0][0].toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  /**
   * Resolves the access-token expiry. The JWT `exp` claim is the source of
   * truth — `expiresAtUtc`/`hint` is treated as a fallback only, useful when
   * the backend issues opaque (non-JWT) tokens.
   */
  private resolveExpiry(accessToken: string, hint: string): number {
    const fromJwt = getJwtExpiry(accessToken);
    if (fromJwt && fromJwt > Date.now()) return fromJwt;

    if (hint) {
      const parsed = Date.parse(hint);
      if (!Number.isNaN(parsed) && parsed > Date.now()) return parsed;
    }

    return Date.now() + 15 * 60 * 1000;
  }

  /** Returns stored tokens IFF the access token is still safely valid. */
  private readFreshTokens(): AuthTokens | null {
    const accessToken = this.getAccessToken();
    const refreshToken = this.getRefreshToken();
    if (!accessToken || !refreshToken) return null;

    const expiresAt = getJwtExpiry(accessToken);
    if (!expiresAt) return null;
    if (expiresAt - Date.now() <= REFRESH_BUFFER_MS) return null;

    return { accessToken, refreshToken, expiresAt };
  }

  // ────────────────────── proactive refresh ──────────────────────

  private scheduleProactiveRefresh(): void {
    this.cancelScheduledRefresh();

    const accessToken = this.getAccessToken();
    if (!accessToken) return;

    const expiresAt = getJwtExpiry(accessToken);
    if (!expiresAt) return;

    const remainingMs = expiresAt - Date.now() - REFRESH_BUFFER_MS;
    const delayMs = Math.max(
      MIN_REFRESH_DELAY_MS,
      Math.min(remainingMs, MAX_SETTIMEOUT_DELAY_MS)
    );

    this.zone.runOutsideAngular(() => {
      this.refreshTimerId = setTimeout(() => {
        this.zone.run(() => {
          if (!this.isLoggedIn()) return;
          // When we hit the setTimeout cap on a long-lived token, the
          // timer fires long before the token is anywhere near expiry —
          // just re-arm without touching the network.
          if (this.readFreshTokens()) {
            this.scheduleProactiveRefresh();
            return;
          }
          this.refreshToken().subscribe({ error: () => {} });
        });
      }, delayMs);
    });
  }

  private cancelScheduledRefresh(): void {
    if (this.refreshTimerId !== null) {
      clearTimeout(this.refreshTimerId);
      this.refreshTimerId = null;
    }
  }

  /**
   * Re-arm the refresh after a transient failure with exponential backoff
   * (5s → 15s → 45s → 120s, capped). The next user-driven 401 will also
   * retry on its own, so this is mostly a recovery net for idle tabs.
   */
  private scheduleRefreshRetry(): void {
    this.cancelScheduledRefresh();
    const idx = Math.min(this.refreshFailureStreak, REFRESH_RETRY_BACKOFF_MS.length - 1);
    const delayMs = REFRESH_RETRY_BACKOFF_MS[idx];
    this.refreshFailureStreak += 1;

    this.zone.runOutsideAngular(() => {
      this.refreshTimerId = setTimeout(() => {
        this.zone.run(() => {
          if (!this.isLoggedIn()) return;
          this.refreshToken().subscribe({ error: () => {} });
        });
      }, delayMs);
    });
  }

  /**
   * True only when the failure status proves the refresh token is dead.
   * Status 0 (network/CORS) and 5xx (server fault) are transient — the
   * server never said "your token is bad," it just couldn't be reached.
   */
  private isAuthFatal(err: unknown): boolean {
    const status = (err as { status?: number } | null)?.status ?? 0;
    return AUTH_FATAL_STATUSES.has(status);
  }

  // ────────────────────── visibility / sleep recovery ──────────────────────

  private initVisibilityRecovery(): void {
    if (typeof document === 'undefined') return;

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState !== 'visible') return;
      if (!this.isLoggedIn()) return;

      const accessToken = this.getAccessToken();
      const expiresAt = accessToken ? getJwtExpiry(accessToken) : null;
      if (!expiresAt) return;

      if (expiresAt - Date.now() <= REFRESH_BUFFER_MS) {
        this.refreshToken().subscribe({ error: () => {} });
      } else {
        this.scheduleProactiveRefresh();
      }
    });

    if (typeof window !== 'undefined') {
      window.addEventListener('pageshow', (e) => {
        if (!(e as PageTransitionEvent).persisted) return;
        if (this.isLoggedIn()) this.scheduleProactiveRefresh();
      });

      window.addEventListener('online', () => {
        if (!this.isLoggedIn()) return;
        const accessToken = this.getAccessToken();
        const expiresAt = accessToken ? getJwtExpiry(accessToken) : null;
        if (expiresAt && expiresAt - Date.now() <= REFRESH_BUFFER_MS) {
          this.refreshToken().subscribe({ error: () => {} });
        }
      });
    }
  }

  // ────────────────────── multi-tab sync ──────────────────────

  private initCrossTabSync(): void {
    if (typeof BroadcastChannel !== 'undefined') {
      try {
        this.channel = new BroadcastChannel(BROADCAST_CHANNEL_NAME);
        this.channel.onmessage = (e) =>
          this.onCrossTabMessage(e.data as CrossTabMessage);
      } catch {
        this.channel = null;
      }
    }

    if (typeof window !== 'undefined') {
      window.addEventListener('storage', (e) => {
        if (e.key !== environment.tokenKey) return;
        this.onCrossTabMessage({
          type: e.newValue ? 'session-updated' : 'logged-out',
          from: 'storage-event',
        });
      });
    }
  }

  private onCrossTabMessage(msg: CrossTabMessage): void {
    if (!msg || typeof msg !== 'object') return;
    // Ignore our own BroadcastChannel echoes (storage events never fire in
    // the originating tab so the 'storage-event' sentinel is always external).
    if (msg.from === this.tabId) return;

    if (msg.type === 'logged-out') {
      this.sessionDead = true;
      this.clearLocalSession();
      this.navigateToLogin();
      return;
    }

    if (msg.type === 'session-updated') {
      this.currentUserSignal.set(this.loadStoredUser());
      this.scheduleProactiveRefresh();
    }
  }

  private broadcast(msg: CrossTabMessage): void {
    try {
      this.channel?.postMessage(msg);
    } catch {
      /* channel closed — ignore */
    }
  }

  // ────────────────────── helpers ──────────────────────

  /**
   * Schedules the "session expired" toast + redirect on a microtask so that
   * the in-flight refresh observable has a chance to error its subscribers
   * first (otherwise the user sees the redirect before the toast).
   */
  private scheduleSessionExpiredLogout(): void {
    if (this.sessionDead || this.hasScheduledLogoutToast) return;
    this.sessionDead = true;
    this.hasScheduledLogoutToast = true;
    queueMicrotask(() => {
      this.hasScheduledLogoutToast = false;
      this.logout({
        redirect: true,
        callApi: false,
        reason: 'انتهت جلستك، يرجى تسجيل الدخول مرة أخرى',
      });
    });
  }

  private makeAuthError(message: string): ApiError {
    return { status: 401, message };
  }
}
