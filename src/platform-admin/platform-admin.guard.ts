import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Request } from 'express';
import { Model, Types, isValidObjectId } from 'mongoose';

import { DomainException } from 'src/common/errors/domain.exception';
import { ErrorCodes } from 'src/common/errors/error-codes';
import { User, UserDocument } from 'src/users/user.schema';

/**
 * Gate for the platform-owner console.
 *
 * Runs *after* JwtAuthGuard (so `request.user` is populated) but the routes it
 * protects carry `@SkipTenant()`, because a platform admin acts across every
 * organization and has no membership to resolve.
 *
 * The flag is read from the database on each request rather than trusted from
 * the JWT: revoking someone's platform access must take effect immediately, not
 * whenever their 15-minute access token happens to expire.
 */
@Injectable()
export class PlatformAdminGuard implements CanActivate {
  constructor(@InjectModel(User.name) private readonly users: Model<UserDocument>) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const user = request.user;

    if (!user || !isValidObjectId(user.userId)) {
      throw DomainException.unauthorized('Sign in to continue.');
    }

    const record = await this.users
      .findById(new Types.ObjectId(user.userId))
      .select({ isPlatformAdmin: 1, status: 1 })
      .lean();

    if (!record?.isPlatformAdmin || record.status !== 'ACTIVE') {
      // Deliberately the same answer either way — an ordinary tenant probing
      // /admin learns nothing about whether the console exists.
      throw DomainException.forbidden(
        'This area is restricted to platform administrators.',
        ErrorCodes.PLATFORM_ADMIN_REQUIRED,
      );
    }

    return true;
  }
}
