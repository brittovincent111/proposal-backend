import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

/**
 * One row per issued refresh token, storing only a SHA-256 hash — a database
 * dump must not hand out live sessions (map.md §46).
 *
 * Rotation writes `replacedByTokenId`; presenting an already-rotated token is
 * treated as theft and revokes the whole family.
 */
@Schema({ collection: 'refresh_tokens', timestamps: true })
export class RefreshToken {
  @Prop({ type: Types.ObjectId, required: true, index: true })
  userId!: Types.ObjectId;

  @Prop({ required: true, unique: true })
  tokenHash!: string;

  /** Groups every rotation of one login so reuse can revoke the lineage at once. */
  @Prop({ required: true, index: true })
  familyId!: string;

  @Prop({ required: true })
  expiresAt!: Date;

  @Prop({ type: Date, default: null })
  revokedAt!: Date | null;

  @Prop({ type: Types.ObjectId, default: null })
  replacedByTokenId!: Types.ObjectId | null;

  @Prop({ default: '' })
  userAgent!: string;

  @Prop({ default: '' })
  ipHash!: string;
}

export type RefreshTokenDocument = HydratedDocument<RefreshToken>;
export const RefreshTokenSchema = SchemaFactory.createForClass(RefreshToken);

// Expired rows are worthless; let Mongo reap them.
RefreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
