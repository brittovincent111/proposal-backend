import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Request } from 'express';
import { timingSafeEqual } from 'node:crypto';

import { CSRF_COOKIE, CSRF_HEADER } from '../auth/cookies';
import { DomainException } from '../errors/domain.exception';
import { ErrorCodes } from '../errors/error-codes';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Double-submit CSRF check — map.md §46.
 *
 * Access tokens live in an httpOnly cookie, so the browser attaches them to
 * cross-site form posts automatically. The paired non-httpOnly CSRF cookie can
 * only be read (and echoed into a header) by same-origin JavaScript, which is
 * what makes the header proof of origin.
 *
 * Requests that authenticate with a bearer header instead of a cookie are not
 * exposed to this class of attack and are exempt.
 */
@Injectable()
export class CsrfGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    if (context.getType() !== 'http') return true;

    const request = context.switchToHttp().getRequest<Request>();
    if (SAFE_METHODS.has(request.method)) return true;

    const cookie = request.cookies?.[CSRF_COOKIE] as string | undefined;
    if (!cookie) return true; // No cookie session in play — nothing to forge.

    const header = request.header(CSRF_HEADER);
    if (!header || !equals(header, cookie)) {
      throw new DomainException(
        ErrorCodes.CSRF_TOKEN_INVALID,
        'Missing or invalid CSRF token.',
        403,
      );
    }
    return true;
  }
}

function equals(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
