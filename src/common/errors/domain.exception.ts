import { HttpException, HttpStatus } from '@nestjs/common';

import { ErrorCode, ErrorCodes } from './error-codes';

export interface DomainErrorBody {
  statusCode: number;
  code: ErrorCode;
  message: string;
  details?: unknown[];
}

/**
 * The only exception domain code should throw. Everything else is normalised by
 * AllExceptionsFilter into the same shape so the client never has to branch on
 * where an error came from.
 */
export class DomainException extends HttpException {
  constructor(
    readonly code: ErrorCode,
    message: string,
    status: HttpStatus = HttpStatus.UNPROCESSABLE_ENTITY,
    readonly details: unknown[] = [],
  ) {
    super({ statusCode: status, code, message, details } satisfies DomainErrorBody, status);
  }

  static notFound(code: ErrorCode, message: string): DomainException {
    return new DomainException(code, message, HttpStatus.NOT_FOUND);
  }

  static forbidden(message: string, code: ErrorCode = ErrorCodes.INSUFFICIENT_PERMISSION): DomainException {
    return new DomainException(code, message, HttpStatus.FORBIDDEN);
  }

  static unauthorized(message: string, code: ErrorCode = ErrorCodes.AUTHENTICATION_REQUIRED): DomainException {
    return new DomainException(code, message, HttpStatus.UNAUTHORIZED);
  }

  static conflict(code: ErrorCode, message: string): DomainException {
    return new DomainException(code, message, HttpStatus.CONFLICT);
  }

  static invalid(code: ErrorCode, message: string, details: unknown[] = []): DomainException {
    return new DomainException(code, message, HttpStatus.UNPROCESSABLE_ENTITY, details);
  }
}
