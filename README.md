# Angular Starter

A production-grade Angular 18 starter extracted from a real enterprise application. Standalone components, signal-based state, a full authentication + refresh-token pipeline, role/permission guards, a layout system, and a reusable component library — all backend-agnostic and ready to point at your API.

This starter is self-contained: it does not depend on any file outside this folder.

---

## 1. Architecture

- **Standalone components only** — no `NgModule` anywhere. Routes use `loadComponent`/`loadChildren` for lazy loading.
- **Signals** for all local/reactive state (auth state, loader, toasts, layout, HTTP cache) — no NgRx/service-level `BehaviorSubject` state stores.
- **HttpContext tokens** (`core/http/http-context.tokens.ts`) drive per-request behavior (skip loader, skip auth, cache, etc.) instead of ad-hoc flags threaded through service methods.
- **Interceptor pipeline** in a deliberate order — see `app.config.ts` for the full rationale, summarized in §4.

### Folder structure

```text
angular-starter/
├── src/
│   ├── app/
│   │   ├── core/
│   │   │   ├── auth/
│   │   │   │   ├── guards/        auth, guest, role, permission, access
│   │   │   │   ├── interceptors/  auth.interceptor.ts (Bearer + 401 refresh)
│   │   │   │   ├── services/      auth.service.ts, device.service.ts
│   │   │   │   ├── models/        auth.model.ts, device.model.ts
│   │   │   │   ├── utils/         jwt.util.ts
│   │   │   │   └── auth.config.ts  ← endpoints + routes, edit this first
│   │   │   ├── interceptors/      cache, error, loader, timeout
│   │   │   ├── services/          api, storage, toast, loader, dialog, layout, http-cache
│   │   │   ├── models/            api-response.model.ts, menu-item.model.ts
│   │   │   ├── constants/         nav.constants.ts, badge.constants.ts
│   │   │   ├── utils/             api-list.util.ts, api-error.util.ts, auto-refresh.util.ts, class-map.util.ts
│   │   │   └── http/              http-context.tokens.ts
│   │   ├── layout/
│   │   │   ├── main-layout/       shell: sidebar + topbar + router-outlet
│   │   │   │   ├── sidebar/
│   │   │   │   └── topbar/
│   │   │   └── auth-layout/       chrome-less wrapper for /auth/* pages
│   │   ├── shared/
│   │   │   ├── components/        badge, modal, confirm-dialog, data-table, pagination,
│   │   │   │                      password-input, searchable-select, stat-card, toast, loader,
│   │   │   │                      form-error, icon
│   │   │   ├── directives/        has-permission.directive.ts
│   │   │   ├── validators/        form-validation.util.ts (+ strong password, phone, match-fields)
│   │   │   ├── models/            form-mode.model.ts
│   │   │   └── utils/             uuid, class-map, date-iso
│   │   ├── features/
│   │   │   ├── auth/pages/        login, register, forgot-password, reset-password
│   │   │   └── dashboard/         placeholder landing page — replace with your own
│   │   ├── app.routes.ts
│   │   ├── app.config.ts
│   │   └── app.component.ts
│   ├── environments/
│   └── styles.scss
├── angular.json
├── package.json
└── tsconfig*.json
```

---

## 2. Authentication

Everything lives under `core/auth/`. `AuthService` (`core/auth/services/auth.service.ts`) is the single source of truth for session state and is the largest, most load-bearing file in the starter — read its inline comments before changing the refresh pipeline.

### What's implemented

| Flow | Method | Notes |
|---|---|---|
| Login | `AuthService.login()` | Posts credentials + device fingerprint, persists tokens, optionally hydrates authoritative permissions from `AUTH_ENDPOINTS.me` |
| Register | `AuthService.register()` | Thin POST wrapper — adjust the payload/response shape to your backend |
| Logout | `AuthService.logout()` | Clears local session, best-effort server call, cross-tab broadcast, redirect |
| Forgot password | `AuthService.forgotPassword(email)` | POST only — wire up your own "check your email" UX |
| Reset password | `AuthService.resetPassword({ email, token, newPassword })` | Expects `email`+`token` query params on the reset link (see `reset-password.component.ts`) |
| Current user | `AuthService.currentUser` (signal), `isAuthenticated`, `permissionSet` | Reactive — every guard/directive re-evaluates automatically on login/logout/cross-tab update |
| Refresh token | `AuthService.refreshToken()` | See §3 |

### State exposed by `AuthService`

```ts
readonly currentUser: Signal<User | null>;
readonly isAuthenticated: Signal<boolean>;
readonly permissionSet: Signal<ReadonlySet<string>>;

hasRole(role: UserRole): boolean;
hasAnyRole(roles: readonly UserRole[]): boolean;
hasPermission(permission: string | readonly string[]): boolean;   // array = "all of"
hasAnyPermission(permissions: readonly string[]): boolean;        // "any of"
```

### Generic by design

- `User`, `AuthTokens`, `LoginRequest`, `AuthResponseData`, etc. live in `core/auth/models/auth.model.ts` — plain, framework-neutral shapes.
- All endpoint paths live in **one file**: `core/auth/auth.config.ts` (`AUTH_ENDPOINTS`, `LOGIN_ROUTE`, `DEFAULT_AUTHENTICATED_ROUTE`).
- `UserRole` is typed as `string` — replace it with a real union (`'Admin' | 'Manager' | ...'`) once you know your backend's roles, and update `AuthService.normalizeRole()` if you need alias/case mapping.
- Token storage keys (`environment.tokenKey` / `refreshTokenKey`) are configurable per environment.

---

## 3. Refresh Token Architecture

```
Request
   ↓
authInterceptor (attaches Bearer; proactively refreshes if token expires within 10s)
   ↓
API
   ↓
401 Unauthorized
   ↓
AuthService.refreshToken()
   ↓
Get new access token
   ↓
Retry original request
   ↓
Return response
```

On failure:

```
Refresh failed
   ↓
Classify: reuse-detected / auth-fatal (400|401|403) / transient (network|5xx)
   ↓
Fatal        → clear session, redirect to LOGIN_ROUTE, show a toast
Reuse        → wait 250ms, re-check storage (cross-tab race?) → recover or fatal
Transient    → exponential backoff retry (5s→15s→45s→120s), session stays alive
```

**Concurrency safety, two layers:**

1. **In-tab** — `refreshToken()` returns a single shared (`share()`-piped) Observable. Every concurrent 401 in the same tab awaits the same in-flight request; only one network call happens.
2. **Cross-tab** — the refresh network call itself runs inside a [Web Locks API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Locks_API) lock (`navigator.locks.request`), so only one tab across the whole browser profile can be refreshing at a time. Before acquiring the lock (and again inside it), the service re-reads storage — if another tab already rotated the token, the network call is skipped entirely. Falls back to in-tab-only safety when Web Locks isn't supported.

Also included: proactive refresh scheduled ~60s before expiry (via the JWT `exp` claim), recovery on tab visibility/online/pageshow, and `BroadcastChannel` + `storage`-event cross-tab session sync (login in one tab reflects in all open tabs; logout in one tab logs out every tab).

**To adapt to your backend:**

- Point `AUTH_ENDPOINTS` (`auth.config.ts`) at your real routes.
- If your backend doesn't do refresh-token rotation/reuse-detection, clear `REUSE_DETECTED_MARKERS` in `auth.service.ts` — every refresh failure will then be classified purely by HTTP status.
- If your access tokens aren't JWTs (no local `exp` you can read), the proactive-refresh path degrades gracefully (`resolveExpiry()` falls back to `expiresAtUtc` or a 15-minute default) — just make sure your backend returns *some* expiry hint.

---

## 4. Guards & Interceptors

**Guards** (`core/auth/guards/`), all parameterized factories:

```ts
authGuard                                  // must be logged in
guestGuard                                 // must NOT be logged in (used on /auth/*)
roleGuard(['Admin'])                       // must hold one of these roles
denyRolesGuard(['Guest'])                  // must NOT hold any of these roles
permissionGuard('Users.Manage')            // must hold this permission ("all of" for arrays)
permissionGuard(['A','B'], { mode: 'any' })
accessGuard({ anyPermission: [...], anyRole: [...] })  // OR across both gates
```

Compose them in `canActivate` arrays — Angular ANDs the array, so use `accessGuard` when you need OR semantics across a permission gate and a role gate.

**Interceptors**, registered in `app.config.ts` in this exact order (outermost → innermost):

```
cache → timeout → loader → error → auth
```

- `cache` — short-circuits GETs marked `withCache()` before any other interceptor runs.
- `timeout` — caps every request at 30s (except login/refresh, which rely on the browser's own timeout — see the inline comment on why).
- `loader` — toggles the global spinner via a request counter (respects `withSkipLoader()`).
- `error` — normalizes every failure into `ApiError`, toasts unless silenced.
- `auth` — attaches the Bearer header and owns the 401 → refresh → retry dance; must be innermost so its refresh logic runs before `error` can toast a 401 that's about to be silently retried.

Per-request behavior is controlled via `HttpContext` builders (`core/http/http-context.tokens.ts`):

```ts
this.api.post(url, body, { context: withInlineHandling() });      // skip loader + skip error toast
this.api.get(url, { context: withCache({ ttlMs: 60_000 }) });     // cache this GET for 1 minute
this.api.post(url, body, { context: withCacheInvalidate(['users']) }); // bust matching cache entries
```

---

## 5. Layouts

- **`layout/main-layout/`** — the authenticated app shell: collapsible sidebar (desktop) / slide-in drawer (mobile), topbar, scrollable content area, and a globally-mounted `<app-confirm-dialog>`. Mobile/collapse state lives in `LayoutService` (`core/services/layout.service.ts`), a tiny signal store.
- **`layout/auth-layout/`** — a bare `<router-outlet>` wrapper for `/auth/*` pages (login, register, forgot/reset password). Add a shared header/illustration here if you want one across all auth pages.

Both are wired in `app.routes.ts` behind `guestGuard`/`authGuard` respectively.

### Sidebar configuration

Navigation is data-driven — edit `core/constants/nav.constants.ts`, not the component:

```ts
export const NAV_SECTIONS: MenuSection[] = [
  {
    label: 'Main',
    items: [
      { id: 'dashboard', label: 'Dashboard', route: '/dashboard', icon: 'home' },
      { id: 'users', label: 'Users', route: '/users', icon: 'users', permissions: ['Users.Manage'] },
      { id: 'settings', label: 'Settings', route: '/settings', icon: 'settings', roles: ['Admin'] },
    ],
  },
];
```

`permissions`/`roles` are OR-gates (matching either hides/shows the item); omit both to show an item to everyone. The sidebar recomputes visible sections reactively off `AuthService.permissionSet()`/`currentUser()`, so login/logout/permission changes update the menu with no manual wiring.

Icons come from `shared/components/icon/icon.component.ts` — a minimal placeholder set (`home`, `users`, `settings`, `file`, `chart`, `grid`, `bell`, `menu`). Swap this component for your icon library of choice (Font Awesome, an SVG sprite, etc.) — just keep the "one component keyed by name" pattern so templates never inline raw markup.

### Topbar configuration

`layout/main-layout/topbar/topbar.component.ts` shows the app name (from `environment.appName`), the current user's avatar/name/role, and a sign-out button wired to `DialogService.confirm()`. Add notification bells, a language switcher, or a theme toggle here — the component is intentionally minimal.

---

## 6. API Configuration

- **Base URL**: `environment.apiUrl` — used by `ApiService` (`core/services/api.service.ts`) to prefix every request.
- **Auth endpoints**: `core/auth/auth.config.ts` (`AUTH_ENDPOINTS`).
- **Everything else**: define your own endpoint constants per feature (a `xyz.endpoints.ts` alongside each feature's service is a reasonable convention) — this starter intentionally ships no business endpoints.

`ApiService` gives you `get/post/put/patch/delete<T>()`, all of which:
- prepend `environment.apiUrl`,
- serialize query params (dropping null/undefined/empty values, repeating array values),
- transparently unwrap a `{ data, success, ... }` envelope into `<T>` (or pass through a raw payload untouched).

For list/paged endpoints, `core/utils/api-list.util.ts` provides `asList`/`toList`, `asPaged`/`toPaged`, and `fetchAllPages()` (drains every page of a paginated endpoint into one array — useful for populating a `<app-searchable-select>`).

---

## 7. Environment Configuration

`src/environments/environment.ts` / `environment.prod.ts`:

```ts
export const environment = {
  production: false,
  appName: 'Angular Starter',
  appVersion: '1.0.0',
  defaultLang: 'en',
  apiUrl: 'https://localhost:5001/api',
  tokenKey: 'app_access_token',
  refreshTokenKey: 'app_refresh_token',
};
```

Change `apiUrl` per environment; `appName` feeds the topbar and `<title>`; the token keys namespace localStorage so multiple apps on the same origin (e.g. `localhost`) don't collide.

---

## 8. Shared Components

All under `shared/components/`, framework-styled via the CSS custom properties defined in `styles.scss` (see §9) — no component hardcodes a color.

| Component | Selector | Notes |
|---|---|---|
| Modal | `<app-modal>` | Body-scroll-lock reference counting across instances, ESC/backdrop close, `sm/md/lg/xl` sizes, `[modal-footer]` content slot |
| Confirm dialog | `<app-confirm-dialog>` | Promise-based via `DialogService.confirm()`; mount once near the app root |
| Toast | `<app-toast>` | `ToastService.success/error/warning/info()`; hover-to-pause, dedup, 5-toast cap |
| Loader | `<app-loader>` | Full-screen overlay driven by `LoaderService`; mount once near the app root |
| Data table | `<app-data-table>` | Generic `<T>`, dotted-path cell access, optional `cellTemplate` per column, `[actions]` content slot |
| Pagination | `<app-pagination>` | 1-based `pageIndex`, windowed page buttons with ellipsis, page-size selector, jump-to-page |
| Badge | `<app-badge>` | `ok/warn/bad/info/purple/teal/pink` variants |
| Stat card | `<app-stat-card>` | label/value/sub display tile |
| Password input | `<app-password-input>` | `ControlValueAccessor`, built-in show/hide toggle |
| Searchable select | `<app-searchable-select>` | `ControlValueAccessor`, in-memory search, keyboard nav, optional inline "create new" |
| Form error | `<app-form-error>` | Renders the first validator error for a bound `AbstractControl` |
| Icon | `<app-icon>` | Minimal inline-SVG set — replace with your icon library |

---

## 9. Theme / Styling

- **Bootstrap 5** (precompiled CSS, no Sass customization) + a CSS-custom-property design-token layer on top, defined once in `:root` inside `styles.scss` (`--bl`, `--gr`, `--am`, `--re`, `--te`, `--pu`, `--pi` color tokens with light-tint variants, `--bg/--bg2/--bg3`, `--txt/--txt2/--txt3`, `--brd/--brd2`, `--r/--rl` radii).
- Every shared component and the layout system reads these variables — **never hardcodes a color** — so re-theming the whole app is a matter of editing the token block once.
- **Dark mode**: not implemented, but the architecture supports it for free — add a `@media (prefers-color-scheme: dark)` block (or a `[data-theme="dark"]` selector) redefining the same token names; see the commented example in `styles.scss`.
- **RTL**: the original app this starter was extracted from was RTL-only; this starter ships LTR by default. To go RTL: set `<html dir="rtl">` in `index.html`, swap the Bootstrap CSS asset for `bootstrap.rtl.min.css`, and audit any `left`/`right` (vs. `inset-inline-start/end`) in component SCSS — most of the layout/sidebar/topbar files already use logical properties.

---

## 10. Roles & Permissions

Two independent gates, composable:

- **Roles** — coarse, one-per-user (`UserRole = string`, currently unconstrained — narrow it to a real union once you know your app's roles).
- **Permissions** — fine-grained strings (e.g. `"Users.Manage"`), held as a `Set<string>` on the current user.

```ts
auth.hasRole('Admin');
auth.hasAnyRole(['Admin', 'Manager']);
auth.hasPermission('Users.Manage');
auth.hasPermission(['Users.Manage', 'Users.Delete']);  // ALL of
auth.hasAnyPermission(['Reports.View', 'Reports.Full']); // ANY of
```

Template-level gating via structural directives:

```html
<button *appHasPermission="'Users.Manage'">Edit</button>
<a *appHasAnyPermission="['Reports.View', 'Reports.Full']">Reports</a>
```

This starter does not ship a role→permission fallback map (the original app's was backend-specific). If your backend can omit the `permissions` array on login, add a static `ROLE_PERMISSIONS: Record<UserRole, string[]>` map and consult it inside `AuthService.resolvePermissions()`.

---

## 11. Adding a New Feature

1. Create `features/<name>/` with `pages/`, a `<name>.routes.ts`, and a `<name>.service.ts` if it talks to the API.
2. Add endpoint constants near the service (don't put business endpoints in `auth.config.ts`).
3. Register the route in `app.routes.ts` under the authenticated branch, guarded as needed:
   ```ts
   {
     path: 'reports',
     canActivate: [permissionGuard('Reports.View')],
     loadChildren: () => import('./features/reports/reports.routes').then((m) => m.reportsRoutes),
   }
   ```
4. Add a `NAV_SECTIONS` entry in `core/constants/nav.constants.ts` if it needs a sidebar link.

## 12. Adding a New API Service

```ts
@Injectable({ providedIn: 'root' })
export class WidgetsService {
  private readonly api = inject(ApiService);

  list(query: PagedQuery) {
    return this.api.get<unknown>('widgets', { params: query, context: withCache() })
      .pipe(toPaged<Widget>());
  }

  create(payload: CreateWidgetRequest) {
    return this.api.post<Widget>('widgets', payload, {
      context: withInlineHandling(withCacheInvalidate(['widgets'])),
    });
  }
}
```

## 13. Adding a New Route

See §11 step 3. Use `roleGuard`/`permissionGuard`/`accessGuard` as appropriate; stack `authGuard` at the parent level (already done for the whole authenticated branch in `app.routes.ts`) rather than repeating it per-route.

## 14. Adding a New Permission

1. Add the string to whatever catalogue you're using in your feature/service layer (this starter ships no permission catalogue — add one, e.g. `core/constants/permissions.const.ts`, once your backend's permission list stabilizes).
2. Reference it in a guard (`permissionGuard('Widgets.Manage')`) and/or a `*appHasPermission` directive.
3. Make sure your backend actually returns it in the login/`me` response — `AuthService.resolvePermissions()` passes the wire array through as-is.

---

## 15. Running the Project

```bash
npm install
npm start          # ng serve — http://localhost:4200
```

## 16. Building for Production

```bash
npm run build       # ng build (production config by default)
```

Output goes to `dist/angular-starter/`.

---

## 17. What to change when starting a new project

- [ ] `environment.ts` / `environment.prod.ts` — `apiUrl`, `appName`, `appVersion`
- [ ] `core/auth/auth.config.ts` — real endpoint paths, default routes
- [ ] `core/auth/models/auth.model.ts` — `UserRole` union, wire shapes to match your backend exactly
- [ ] `core/auth/services/auth.service.ts` — `normalizeRole()`, `resolvePermissions()`, `REUSE_DETECTED_MARKERS` (delete/adjust if your backend has no reuse-detection), `hydratePermissions()` (delete the extra "me" call if login already returns full permissions)
- [ ] `core/constants/nav.constants.ts` — your real sidebar menu
- [ ] `shared/components/icon/icon.component.ts` — swap in your real icon set/library
- [ ] `layout/main-layout/topbar/` — logo, and any product-specific header actions (notifications, language switcher, theme toggle)
- [ ] `styles.scss` — color tokens (`--bl`, `--gr`, etc.) to match your brand
- [ ] `index.html` — `<title>`, `dir`/`lang`, favicon
- [ ] `package.json` — project `name`
- [ ] `angular.json` — project name (currently `angular-starter`), Bootstrap import (swap for `bootstrap.rtl.min.css` if you need RTL)
- [ ] Add a permission catalogue + role→permission fallback map if your backend needs one
- [ ] Delete `features/dashboard/` and `features/auth/pages/*` example content once you've copied what you need — they're meant as a working reference, not permanent scaffolding
