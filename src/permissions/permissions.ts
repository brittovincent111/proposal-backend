/**
 * Roles are a shorthand for permission sets — map.md §6.
 *
 * Guards check permissions, never roles, so a future custom-role feature only
 * has to change how a member's permission set is resolved.
 */
export const Roles = ['OWNER', 'ADMIN', 'MANAGER', 'STAFF', 'VIEWER'] as const;
export type Role = (typeof Roles)[number];

export const Permissions = [
  'organization.manage',
  'organization.delete',
  'team.manage',
  'billing.view',
  'billing.manage',
  'customer.view',
  'customer.manage',
  'catalog.view',
  'catalog.manage',
  'package.view',
  'package.manage',
  'block.view',
  'block.manage',
  'template.view',
  'template.create',
  'template.edit',
  'template.publish',
  'template.delete',
  'document.view',
  'document.create',
  'document.edit',
  'document.send',
  'document.approve',
  'document.delete',
] as const;
export type Permission = (typeof Permissions)[number];

const VIEWER: Permission[] = [
  'customer.view',
  'catalog.view',
  'package.view',
  'block.view',
  'template.view',
  'document.view',
];

const STAFF: Permission[] = [
  ...VIEWER,
  'customer.manage',
  'document.create',
  // Staff edit the documents they produce; the master template stays read-only.
  'document.edit',
];

const MANAGER: Permission[] = [...STAFF, 'document.send', 'document.approve', 'package.manage'];

const ADMIN: Permission[] = [
  ...MANAGER,
  'catalog.manage',
  'block.manage',
  'template.create',
  'template.edit',
  'template.publish',
  'template.delete',
  'document.delete',
  'team.manage',
  // An admin sees what the workspace is paying for; only the owner can change it.
  'billing.view',
];

const OWNER: Permission[] = [
  ...ADMIN,
  'organization.manage',
  'organization.delete',
  'billing.manage',
];

const BY_ROLE: Record<Role, Permission[]> = {
  OWNER,
  ADMIN,
  MANAGER,
  STAFF,
  VIEWER,
};

export function permissionsForRole(role: Role): Set<Permission> {
  return new Set(BY_ROLE[role] ?? []);
}

export function roleHasPermission(role: Role, permission: Permission): boolean {
  return permissionsForRole(role).has(permission);
}
