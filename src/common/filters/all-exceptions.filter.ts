import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';
import { Error as MongooseError, mongo } from 'mongoose';

import { DomainErrorBody } from '../errors/domain.exception';
import { ErrorCode, ErrorCodes } from '../errors/error-codes';

type PayloadTooLargeException = Error & {
  status?: number;
  statusCode?: number;
  type?: string;
};

/**
 * Normalises every thrown value into the map.md §48 error envelope.
 *
 * Unrecognised errors deliberately lose their message on the way out: an
 * unexpected stack trace is a leak, not a feature.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const body = this.toBody(exception);

    if (body.statusCode >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(
        `${body.code}: ${exception instanceof Error ? exception.message : String(exception)}`,
        exception instanceof Error ? exception.stack : undefined,
      );
    }

    response.status(body.statusCode).json(body);
  }

  private toBody(exception: unknown): DomainErrorBody {
    if (exception instanceof HttpException) {
      const payload = exception.getResponse();
      const status = exception.getStatus();

      // Already a domain envelope — pass it through untouched.
      if (this.isDomainBody(payload)) return payload;

      // Nest's built-ins (ValidationPipe, NotFoundException, throttler…).
      const message =
        typeof payload === 'string'
          ? payload
          : ((payload as { message?: string | string[] }).message ?? exception.message);

      return {
        statusCode: status,
        code: this.codeForStatus(status),
        message: Array.isArray(message) ? 'Request validation failed.' : message,
        details: Array.isArray(message) ? message : [],
      };
    }

    if (this.isPayloadTooLarge(exception)) {
      return {
        statusCode: HttpStatus.PAYLOAD_TOO_LARGE,
        code: ErrorCodes.PAYLOAD_TOO_LARGE,
        message: 'Request payload is too large.',
      };
    }

    if (exception instanceof MongooseError.VersionError) {
      return {
        statusCode: HttpStatus.CONFLICT,
        code: ErrorCodes.CONCURRENT_EDIT_CONFLICT,
        message: 'This record was modified by someone else. Reload and try again.',
      };
    }

    if (exception instanceof MongooseError.ValidationError) {
      return {
        statusCode: HttpStatus.UNPROCESSABLE_ENTITY,
        code: ErrorCodes.VALIDATION_FAILED,
        message: 'Request validation failed.',
        details: Object.values(exception.errors).map((error) => error.message),
      };
    }

    if (exception instanceof mongo.MongoServerError && exception.code === 11000) {
      const duplicatePairs = Object.entries(exception.keyValue ?? {});
      const message = duplicatePairs.length
        ? duplicatePairs
            .map(([key, value]) => `${key} "${String(value)}" already exists`)
            .join(', ')
        : 'A record with these values already exists.';

      return {
        statusCode: HttpStatus.CONFLICT,
        code: ErrorCodes.CONCURRENT_EDIT_CONFLICT,
        message,
      };
    }

    return {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      code: ErrorCodes.INTERNAL_ERROR,
      message: 'Something went wrong.',
    };
  }

  private isDomainBody(payload: unknown): payload is DomainErrorBody {
    return (
      typeof payload === 'object' &&
      payload !== null &&
      'code' in payload &&
      'statusCode' in payload &&
      typeof (payload as { code: unknown }).code === 'string'
    );
  }

  private isPayloadTooLarge(exception: unknown): exception is PayloadTooLargeException {
    if (!(exception instanceof Error)) return false;

    const error = exception as PayloadTooLargeException;
    return (
      error.status === HttpStatus.PAYLOAD_TOO_LARGE ||
      error.statusCode === HttpStatus.PAYLOAD_TOO_LARGE ||
      error.type === 'entity.too.large'
    );
  }

  private codeForStatus(status: number): ErrorCode {
    switch (status) {
      case HttpStatus.UNAUTHORIZED:
        return ErrorCodes.AUTHENTICATION_REQUIRED;
      case HttpStatus.FORBIDDEN:
        return ErrorCodes.INSUFFICIENT_PERMISSION;
      case HttpStatus.NOT_FOUND:
        return ErrorCodes.NOT_FOUND;
      case HttpStatus.CONFLICT:
        return ErrorCodes.CONCURRENT_EDIT_CONFLICT;
      case HttpStatus.PAYLOAD_TOO_LARGE:
        return ErrorCodes.PAYLOAD_TOO_LARGE;
      case HttpStatus.TOO_MANY_REQUESTS:
        return ErrorCodes.RATE_LIMITED;
      case HttpStatus.BAD_REQUEST:
      case HttpStatus.UNPROCESSABLE_ENTITY:
        return ErrorCodes.VALIDATION_FAILED;
      default:
        return ErrorCodes.INTERNAL_ERROR;
    }
  }
}
