import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { ToastService } from '../../services/toast.service';
import { UserRole } from '../models/auth.model';
import { DEFAULT_AUTHENTICATED_ROUTE, LOGIN_ROUTE } from '../auth.config';

interface AccessGuardOptions {
  /** Grant if the user holds ANY of these permissions. */
  anyPermission?: ReadonlyArray<string>;
  /** Grant if the user's role is ANY of these. */
  anyRole?: ReadonlyArray<UserRole>;
  /** Where to redirect on denial. Default: `DEFAULT_AUTHENTICATED_ROUTE`. */
  fallback?: string;
  /** Toast shown on denial. Defaults to a generic message. */
  message?: string;
}

/**
 * Restricts a route to users who satisfy a permission gate **OR** a role
 * gate — the missing piece in {@link permissionGuard} (permissions only)
 * and {@link roleGuard} (roles only), which Angular composes as AND when
 * stacked in a `canActivate` array.
 *
 *   canActivate: [accessGuard({
 *     anyPermission: ['Invoices.View'],
 *     anyRole: ['Representative'],
 *   })]
 *
 * Pair with `authGuard` higher in the tree — this guard assumes the user is
 * already authenticated and only redirects to the login route if not.
 */
export const accessGuard = (options: AccessGuardOptions): CanActivateFn => () => {
  const auth = inject(AuthService);
  const toast = inject(ToastService);
  const router = inject(Router);

  if (!auth.isLoggedIn()) {
    return router.createUrlTree([LOGIN_ROUTE]);
  }

  const permOk =
    !!options.anyPermission?.length &&
    auth.hasAnyPermission(options.anyPermission);
  const roleOk =
    !!options.anyRole?.length && auth.hasAnyRole(options.anyRole);

  if (permOk || roleOk) return true;

  toast.error(options.message ?? 'ليس لديك صلاحية للوصول إلى هذه الصفحة');
  return router.createUrlTree([options.fallback ?? DEFAULT_AUTHENTICATED_ROUTE]);
};
