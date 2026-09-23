/**
 * Generic role type. Replace with a union matching your backend, e.g.:
 *   export type UserRole = 'Admin' | 'Manager' | 'Staff' | 'Client';
 */
export type UserRole = string;

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  avatar: string;
  permissions: string[];
}

/** Local, normalized token bundle used everywhere inside the app. */
export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  /** Millisecond epoch — sourced from the JWT `exp` claim. */
  expiresAt: number;
}

// ─────────── Wire shapes — adjust to match your backend exactly ───────────

export interface LoginRequest {
  email: string;
  password: string;
  rememberMe: boolean;
  deviceInfo: string;
  deviceId: string;
}

export interface RegisterRequest {
  name: string;
  email: string;
  password: string;
}

export interface RefreshTokenRequest {
  refreshToken: string;
  deviceInfo: string;
  deviceId: string;
}

export interface LogoutRequest {
  refreshToken: string;
}

export interface ForgotPasswordRequest {
  email: string;
}

export interface ResetPasswordRequest {
  email: string;
  token: string;
  newPassword: string;
}

/**
 * Shape returned in the `data` field for /auth/login and /auth/refresh-token.
 * On refresh, user fields may come back empty — never overwrite the cached
 * user with an empty payload.
 */
export interface AuthResponseData {
  accessToken: string;
  refreshToken: string;
  userId: string;
  email: string | null;
  userName: string | null;
  /** The user's role name, e.g. `"Admin"`. Source of truth for role checks. */
  role?: string | null;
  /** Flat array of permission strings (e.g. `"Users.Manage"`). */
  permissions?: ReadonlyArray<string> | null;
  /** ISO date — treated as a hint only; the JWT `exp` claim is authoritative. */
  expiresAtUtc: string;
}

/**
 * `data` shape of the "current user" / "me" endpoint — the authoritative
 * role + permission set for the currently authenticated user. Optionally
 * fetched right after login when the login payload's permission list isn't
 * guaranteed to be complete.
 */
export interface MePermissionsData {
  userId: string;
  userName: string | null;
  email: string | null;
  role: string | null;
  permissions: ReadonlyArray<string> | null;
}
