import { CookieOptions, Response } from 'express';

import { AppConfig } from '../config/configuration';

export const ACCESS_COOKIE = 'qtn_access';
export const REFRESH_COOKIE = 'qtn_refresh';
export const CSRF_COOKIE = 'qtn_csrf';
export const CSRF_HEADER = 'x-csrf-token';

/** Refresh cookies are scoped to the auth routes so they never ride along on ordinary calls. */
export function refreshCookiePath(apiPrefix: string): string {
  return `/${apiPrefix.replace(/^\/|\/$/g, '')}/auth`;
}

function base(config: AppConfig): CookieOptions {
  return {
    httpOnly: true,
    secure: config.cookieSecure,
    // 'lax' keeps the cookie on top-level navigations while blocking cross-site
    // POSTs; 'none' is required once the API is on a different site in production.
    sameSite: config.cookieSecure ? 'none' : 'lax',
    domain: config.COOKIE_DOMAIN,
    path: '/',
  };
}

export function setAuthCookies(
  response: Response,
  config: AppConfig,
  tokens: { accessToken: string; refreshToken: string; csrfToken: string; refreshExpiresAt: Date },
): void {
  response.cookie(ACCESS_COOKIE, tokens.accessToken, base(config));
  response.cookie(REFRESH_COOKIE, tokens.refreshToken, {
    ...base(config),
    path: refreshCookiePath(config.API_PREFIX),
    expires: tokens.refreshExpiresAt,
  });
  // Readable by same-origin JS on purpose — that is the whole double-submit trick.
  response.cookie(CSRF_COOKIE, tokens.csrfToken, { ...base(config), httpOnly: false });
}

export function clearAuthCookies(response: Response, config: AppConfig): void {
  response.clearCookie(ACCESS_COOKIE, base(config));
  response.clearCookie(REFRESH_COOKIE, {
    ...base(config),
    path: refreshCookiePath(config.API_PREFIX),
  });
  response.clearCookie(CSRF_COOKIE, { ...base(config), httpOnly: false });
}
