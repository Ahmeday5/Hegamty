import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { ToastService } from '../../services/toast.service';
import { UserRole } from '../models/auth.model';
import { DEFAULT_AUTHENTICATED_ROUTE, LOGIN_ROUTE } from '../auth.config';

const DEFAULT_DENIED_MESSAGE = 'ليس لديك صلاحية للوصول إلى هذه الصفحة';

/**
 * Restricts a route to specific roles.
 *
 *   { path: 'users', canActivate: [authGuard, roleGuard(['Admin'])], ... }
 */
export const roleGuard = (allowed: ReadonlyArray<UserRole>): CanActivateFn =>
  () => {
    const auth = inject(AuthService);
    const toast = inject(ToastService);
    const router = inject(Router);

    if (!auth.isLoggedIn()) {
      return router.createUrlTree([LOGIN_ROUTE]);
    }
    if (auth.hasAnyRole(allowed)) return true;

    toast.error(DEFAULT_DENIED_MESSAGE);
    return router.createUrlTree([DEFAULT_AUTHENTICATED_ROUTE]);
  };

/**
 * Inverse of {@link roleGuard} — denies the listed roles and lets everyone
 * else through. Use it to carve a role out of a route it would otherwise
 * reach via permissions.
 *
 *   { path: 'admin-only', canActivate: [denyRolesGuard(['Guest'])] }
 */
export const denyRolesGuard = (
  blocked: ReadonlyArray<UserRole>,
): CanActivateFn => () => {
  const auth = inject(AuthService);
  const toast = inject(ToastService);
  const router = inject(Router);

  if (!auth.isLoggedIn()) {
    return router.createUrlTree([LOGIN_ROUTE]);
  }
  if (auth.hasAnyRole(blocked)) {
    toast.error(DEFAULT_DENIED_MESSAGE);
    return router.createUrlTree([DEFAULT_AUTHENTICATED_ROUTE]);
  }
  return true;
};
