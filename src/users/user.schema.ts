import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type UserStatus = 'ACTIVE' | 'INVITED' | 'SUSPENDED';

@Schema({ collection: 'users', timestamps: true })
export class User {
  /** Stored lowercase; the unique index is what actually prevents duplicates. */
  @Prop({ type: String, required: true, unique: true, lowercase: true, trim: true })
  email!: string;

  /** Null for members invited but not yet activated, and for future SSO users. */
  @Prop({ type: String, default: null })
  passwordHash!: string | null;

  @Prop({ type: String, default: null })
  authProviderReference!: string | null;

  @Prop({ type: String, default: '' })
  firstName!: string;

  @Prop({ type: String, default: '' })
  lastName!: string;

  @Prop({ type: String, default: null })
  avatarUrl!: string | null;

  @Prop({ type: String, default: 'ACTIVE', enum: ['ACTIVE', 'INVITED', 'SUSPENDED'] })
  status!: UserStatus;

  @Prop({ type: Date, default: null })
  lastLoginAt!: Date | null;

  /**
   * Staff of the QTN platform itself, not of any tenant — this is what unlocks
   * /admin. Deliberately a flag on the user rather than a role inside an
   * organization: platform admins act across every tenant, so a membership-based
   * role could never express it.
   *
   * There is no API that sets this. It is granted by a direct database update or
   * the `admin:grant` CLI, so a compromised signup flow cannot mint one.
   */
  @Prop({ type: Boolean, default: false })
  isPlatformAdmin!: boolean;
}

export type UserDocument = HydratedDocument<User>;
export const UserSchema = SchemaFactory.createForClass(User);

// email's unique index comes from `unique: true` on the prop above.
