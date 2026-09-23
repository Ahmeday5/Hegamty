export const environment = {
  production: false,
  appName: 'Hegamty',
  appVersion: '1.0.0',
  defaultLang: 'ar',

  apiUrl: 'https://localhost:5001/api',
  tokenKey: 'app_access_token',
  refreshTokenKey: 'app_refresh_token',

  /**
   * UI-only mode: login accepts ANY email/password and opens a local mock
   * session without calling the API. Set to `false` once the backend is live.
   */
  mockAuth: true,
};
