import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { LOGIN_ROUTE } from '../auth.config';

/** Restricts a route to authenticated users, attaching `returnUrl` on redirect. */
export const authGuard: CanActivateFn = (_route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (auth.isLoggedIn()) return true;

  return router.createUrlTree([LOGIN_ROUTE], {
    queryParams: { returnUrl: state.url },
  });
};
