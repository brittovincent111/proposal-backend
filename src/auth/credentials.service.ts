import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';

import { DomainException } from 'src/common/errors/domain.exception';
import { ErrorCodes } from 'src/common/errors/error-codes';
import { generateShareToken, hashToken } from 'src/common/utils/ids';
import {
  CredentialToken,
  CredentialTokenDocument,
  CredentialTokenPurpose,
} from './credential-token.schema';

const TTL_HOURS: Record<CredentialTokenPurpose, number> = {
  PASSWORD_RESET: 2,
  // Invites are handed over out of band, often at the end of a working day.
  INVITE: 24 * 7,
};

export interface IssuedCredentialToken {
  /** Returned once. Only the hash is stored. */
  token: string;
  expiresAt: Date;
}

@Injectable()
export class CredentialsService {
  constructor(
    @InjectModel(CredentialToken.name)
    private readonly tokens: Model<CredentialTokenDocument>,
  ) {}

  /**
   * Mints a single-use link token.
   *
   * Any unused token of the same purpose for that user is retired first, so a
   * second "forgot password" click cannot leave two live links behind.
   */
  async issue(input: {
    userId: Types.ObjectId;
    purpose: CredentialTokenPurpose;
    organizationId?: Types.ObjectId | null;
    createdById?: Types.ObjectId | null;
  }): Promise<IssuedCredentialToken> {
    await this.tokens.updateMany(
      { userId: input.userId, purpose: input.purpose, usedAt: null },
      { $set: { usedAt: new Date() } },
    );

    const token = generateShareToken();
    const expiresAt = new Date(Date.now() + TTL_HOURS[input.purpose] * 60 * 60 * 1000);

    await this.tokens.create({
      userId: input.userId,
      organizationId: input.organizationId ?? null,
      tokenHash: hashToken(token),
      purpose: input.purpose,
      expiresAt,
      createdById: input.createdById ?? null,
    });

    return { token, expiresAt };
  }

  /**
   * Consumes a token, atomically.
   *
   * The `usedAt: null` filter inside `findOneAndUpdate` is what makes it
   * single-use: two concurrent submissions of the same link cannot both win.
   */
  async consume(
    token: string,
    purpose: CredentialTokenPurpose,
  ): Promise<CredentialTokenDocument> {
    const claimed = await this.tokens.findOneAndUpdate(
      {
        tokenHash: hashToken(token),
        purpose,
        usedAt: null,
        expiresAt: { $gt: new Date() },
      },
      { $set: { usedAt: new Date() } },
      { new: true },
    );

    if (!claimed) {
      // One message for missing, used and expired alike — a caller must not be
      // able to probe which links exist.
      throw DomainException.invalid(
        ErrorCodes.VALIDATION_FAILED,
        'This link is no longer valid. Ask for a new one.',
      );
    }

    return claimed;
  }
}
