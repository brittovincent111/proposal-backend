import { ExecutionContext, SetMetadata, createParamDecorator } from '@nestjs/common';
import { Request } from 'express';

import { Permission } from 'src/permissions/permissions';
import { AuthenticatedUser, TenantContext } from '../context/request-context';

export const IS_PUBLIC_KEY = 'qtn:isPublic';
export const SKIP_TENANT_KEY = 'qtn:skipTenant';
export const REQUIRED_PERMISSIONS_KEY = 'qtn:permissions';

/** Opts a route out of authentication entirely (health, login, public proposals). */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

/** Authenticated but not yet inside an organization — used by /auth/me and org bootstrap. */
export const SkipTenant = () => SetMetadata(SKIP_TENANT_KEY, true);

export const RequirePermissions = (...permissions: Permission[]) =>
  SetMetadata(REQUIRED_PERMISSIONS_KEY, permissions);

export const CurrentUser = createParamDecorator((_data: unknown, context: ExecutionContext): AuthenticatedUser => {
  const request = context.switchToHttp().getRequest<Request>();
  if (!request.user) throw new Error('CurrentUser used on a route without JwtAuthGuard');
  return request.user;
});

export const CurrentTenant = createParamDecorator((_data: unknown, context: ExecutionContext): TenantContext => {
  const request = context.switchToHttp().getRequest<Request>();
  if (!request.tenant) throw new Error('CurrentTenant used on a route without OrganizationGuard');
  return request.tenant;
});
