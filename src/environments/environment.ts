export const environment = {
  production: false,
  appName: 'HiCan',
  appVersion: '1.0.0',
  defaultLang: 'ar',

  apiUrl: 'http://hajjamati-api.runasp.net/api',
  tokenKey: 'app_access_token',
  refreshTokenKey: 'app_refresh_token',

  /**
   * UI-only mode: login accepts ANY email/password and opens a local mock
   * session without calling the API. Keep `false` now that the backend is live.
   */
  mockAuth: false,
};
