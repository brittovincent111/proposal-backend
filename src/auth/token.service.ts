import { Inject, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectModel } from '@nestjs/mongoose';
import { randomBytes, randomUUID } from 'node:crypto';
import { Model, Types } from 'mongoose';

import { APP_CONFIG } from 'src/common/config/config.module';
import { AppConfig } from 'src/common/config/configuration';
import { DomainException } from 'src/common/errors/domain.exception';
import { ErrorCodes } from 'src/common/errors/error-codes';
import { hashToken } from 'src/common/utils/ids';
import { UsersService } from 'src/users/users.service';
import { RefreshToken, RefreshTokenDocument } from './refresh-token.schema';

export interface AccessTokenPayload {
  sub: string;
  email: string;
}

export interface IssuedTokens {
  accessToken: string;
  refreshToken: string;
  refreshTokenId: Types.ObjectId;
  csrfToken: string;
  refreshExpiresAt: Date;
}

@Injectable()
export class TokenService {
  constructor(
    private readonly jwt: JwtService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly users: UsersService,
    @InjectModel(RefreshToken.name) private readonly tokens: Model<RefreshTokenDocument>,
  ) {}

  async issue(
    user: { id: Types.ObjectId; email: string },
    context: { userAgent?: string; ipHash?: string; familyId?: string },
  ): Promise<IssuedTokens> {
    const accessToken = await this.jwt.signAsync(
      { sub: user.id.toString(), email: user.email } satisfies AccessTokenPayload,
      { secret: this.config.JWT_ACCESS_SECRET, expiresIn: this.config.JWT_ACCESS_TTL_SECONDS },
    );

    // The refresh token is opaque: its only meaning is the row it hashes to, so
    // revoking it is a database write rather than a signature-verification trick.
    const refreshToken = randomBytes(48).toString('base64url');
    const days = this.config.JWT_REFRESH_TTL_DAYS;
    const refreshExpiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);

    const record = await this.tokens.create({
      userId: user.id,
      tokenHash: hashToken(refreshToken),
      familyId: context.familyId ?? randomUUID(),
      expiresAt: refreshExpiresAt,
      userAgent: context.userAgent?.slice(0, 200) ?? '',
      ipHash: context.ipHash ?? '',
    });

    return {
      accessToken,
      refreshToken,
      refreshTokenId: record._id,
      csrfToken: randomBytes(24).toString('base64url'),
      refreshExpiresAt,
    };
  }

  /**
   * Rotates a refresh token.
   *
   * Presenting a token that was already rotated means the value leaked, so the
   * entire family is revoked rather than just the replayed row — map.md §46.
   */
  async rotate(
    presented: string,
    context: { userAgent?: string; ipHash?: string },
  ): Promise<{ tokens: IssuedTokens; userId: Types.ObjectId; email: string }> {
    const existing = await this.tokens.findOne({ tokenHash: hashToken(presented) });
    const expired = () =>
      DomainException.unauthorized('Session expired. Sign in again.', ErrorCodes.REFRESH_TOKEN_INVALID);

    if (!existing) throw expired();

    if (existing.revokedAt || existing.expiresAt.getTime() < Date.now()) {
      await this.revokeFamily(existing.familyId);
      throw expired();
    }

    const user = await this.users.findById(existing.userId);
    if (!user || user.status !== 'ACTIVE') {
      await this.revokeFamily(existing.familyId);
      throw expired();
    }

    const issued = await this.issue(
      { id: existing.userId, email: user.email },
      { ...context, familyId: existing.familyId },
    );

    existing.revokedAt = new Date();
    existing.replacedByTokenId = issued.refreshTokenId;
    await existing.save();

    return { tokens: issued, userId: existing.userId, email: user.email };
  }

  async revoke(presented: string | undefined): Promise<void> {
    if (!presented) return;
    await this.tokens.updateOne(
      { tokenHash: hashToken(presented), revokedAt: null },
      { $set: { revokedAt: new Date() } },
    );
  }

  async revokeAllForUser(userId: Types.ObjectId): Promise<void> {
    await this.tokens.updateMany({ userId, revokedAt: null }, { $set: { revokedAt: new Date() } });
  }

  private async revokeFamily(familyId: string): Promise<void> {
    await this.tokens.updateMany({ familyId, revokedAt: null }, { $set: { revokedAt: new Date() } });
  }
}
