import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { Model, Types, isValidObjectId } from 'mongoose';

import {
  OrganizationMember,
  OrganizationMemberDocument,
} from 'src/members/organization-member.schema';
import { permissionsForRole } from 'src/permissions/permissions';
import { IS_PUBLIC_KEY, SKIP_TENANT_KEY } from '../decorators';
import { DomainException } from '../errors/domain.exception';
import { ErrorCodes } from '../errors/error-codes';

/**
 * Resolves the tenant for the request — the single place organizationId enters
 * the system (map.md §5).
 *
 * The client may *request* an organization via `x-organization-id`, but the
 * value is only honoured once an ACTIVE membership for the authenticated user
 * is found. A caller who names someone else's organization gets 403, and the
 * header is otherwise ignored — no query below this guard ever reads it.
 */
@Injectable()
export class OrganizationGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @InjectModel(OrganizationMember.name)
    private readonly members: Model<OrganizationMemberDocument>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const skip = this.reflector.getAllAndOverride<boolean>(SKIP_TENANT_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (skip || isPublic) return true;

    const request = context.switchToHttp().getRequest<Request>();
    const user = request.user;
    if (!user) throw DomainException.unauthorized('Sign in to continue.');

    const requested = request.header('x-organization-id');
    const filter: Record<string, unknown> = {
      userId: new Types.ObjectId(user.userId),
      status: 'ACTIVE',
    };

    if (requested) {
      if (!isValidObjectId(requested)) {
        throw DomainException.forbidden('You do not have access to this organization.');
      }
      filter.organizationId = new Types.ObjectId(requested);
    }

    // Without an explicit header, fall back to the caller's oldest membership so
    // single-org users never have to send one.
    const member = await this.members.findOne(filter).sort({ createdAt: 1 }).lean();

    if (!member) {
      throw requested
        ? DomainException.forbidden('You do not have access to this organization.')
        : new DomainException(
            ErrorCodes.ORGANIZATION_REQUIRED,
            'This account does not belong to an organization yet.',
            403,
          );
    }

    request.tenant = {
      organizationId: member.organizationId.toString(),
      memberId: member._id.toString(),
      role: member.role,
      permissions: permissionsForRole(member.role),
    };
    return true;
  }
}
