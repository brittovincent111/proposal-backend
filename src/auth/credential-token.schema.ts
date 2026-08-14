import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type CredentialTokenPurpose = 'PASSWORD_RESET' | 'INVITE';

/**
 * A single-use link that lets someone set a password: either a reset for an
 * existing account or the first password for an invited member.
 *
 * Only the hash is stored, exactly like a share token — the raw value exists in
 * the delivered link and nowhere else, so a database leak cannot be replayed to
 * take over an account. Consuming one stamps `usedAt` rather than deleting it,
 * which keeps the audit trail; the TTL index clears expired rows.
 */
@Schema({ collection: 'credential_tokens', timestamps: true })
export class CredentialToken {
  @Prop({ type: Types.ObjectId, required: true, index: true })
  userId!: Types.ObjectId;

  /** Present for invites so the accepting user joins the right organization. */
  @Prop({ type: Types.ObjectId, default: null })
  organizationId!: Types.ObjectId | null;

  @Prop({ type: String, required: true, unique: true })
  tokenHash!: string;

  @Prop({ type: String, required: true, enum: ['PASSWORD_RESET', 'INVITE'] })
  purpose!: CredentialTokenPurpose;

  @Prop({ type: Date, required: true })
  expiresAt!: Date;

  @Prop({ type: Date, default: null })
  usedAt!: Date | null;

  @Prop({ type: Types.ObjectId, default: null })
  createdById!: Types.ObjectId | null;
}

export type CredentialTokenDocument = HydratedDocument<CredentialToken>;
export const CredentialTokenSchema = SchemaFactory.createForClass(CredentialToken);

// tokenHash's unique index comes from `unique: true` on the prop above.
CredentialTokenSchema.index({ userId: 1, purpose: 1, usedAt: 1 });
// Mongo drops the row once it expires; validity is still checked in code.
CredentialTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
