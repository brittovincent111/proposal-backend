import { Permission, Role } from 'src/permissions/permissions';

export interface AuthenticatedUser {
  userId: string;
  email: string;
}

/**
 * Everything downstream code is allowed to trust about the caller.
 *
 * `organizationId` is derived from a verified membership — map.md §5 forbids
 * taking it from the request body — so any query scoped by this field is safe.
 */
export interface TenantContext {
  organizationId: string;
  memberId: string;
  role: Role;
  permissions: Set<Permission>;
}

export interface RequestContext {
  user: AuthenticatedUser;
  tenant: TenantContext;
}

declare module 'express' {
  interface Request {
    user?: AuthenticatedUser;
    tenant?: TenantContext;
  }
}
