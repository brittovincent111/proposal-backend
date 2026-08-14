import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';

import { Permission } from 'src/permissions/permissions';
import { REQUIRED_PERMISSIONS_KEY } from '../decorators';
import { DomainException } from '../errors/domain.exception';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Permission[]>(REQUIRED_PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required?.length) return true;

    const tenant = context.switchToHttp().getRequest<Request>().tenant;
    if (!tenant) throw DomainException.forbidden('Organization context is required.');

    const missing = required.filter((permission) => !tenant.permissions.has(permission));
    if (missing.length) {
      throw DomainException.forbidden(
        `Your role (${tenant.role}) cannot perform this action.`,
      );
    }
    return true;
  }
}
