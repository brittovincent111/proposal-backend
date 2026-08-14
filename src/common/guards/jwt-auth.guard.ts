import { ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';

import { IS_PUBLIC_KEY } from '../decorators';
import { DomainException } from '../errors/domain.exception';
import { ErrorCodes } from '../errors/error-codes';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;
    return super.canActivate(context);
  }

  handleRequest<TUser>(error: unknown, user: TUser): TUser {
    if (error || !user) {
      throw DomainException.unauthorized(
        'Sign in to continue.',
        ErrorCodes.AUTHENTICATION_REQUIRED,
      );
    }
    return user;
  }
}
