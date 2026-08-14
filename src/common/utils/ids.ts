import { randomBytes, createHash } from 'node:crypto';
import { Types, isValidObjectId } from 'mongoose';

import { DomainException } from '../errors/domain.exception';
import { ErrorCode } from '../errors/error-codes';

/**
 * Converts a path parameter into an ObjectId.
 *
 * A malformed id yields the same 404 as a well-formed id belonging to another
 * tenant — map.md §86 requires that cross-tenant probing cannot distinguish
 * "does not exist" from "not yours".
 */
export function toObjectId(value: string, code: ErrorCode, label: string): Types.ObjectId {
  if (!isValidObjectId(value)) throw DomainException.notFound(code, `${label} not found.`);
  return new Types.ObjectId(value);
}

/** URL-safe, 256 bits of entropy — map.md §34. */
export function generateShareToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Coarse, salted fingerprint for audit metadata; never reversible to an IP. */
export function hashIp(ip: string | undefined, salt: string): string {
  if (!ip) return '';
  return createHash('sha256').update(`${salt}:${ip}`).digest('hex').slice(0, 32);
}

let counter = 0;

/** Short ids for embedded sub-documents (lines, sections, blocks) that need no _id. */
export function nextLocalId(prefix: string): string {
  counter += 1;
  return `${prefix}_${Date.now().toString(36)}${counter.toString(36)}${randomBytes(3).toString('hex')}`;
}
