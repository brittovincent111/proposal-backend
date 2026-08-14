import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

import { Role, Roles } from 'src/permissions/permissions';

export type MemberStatus = 'ACTIVE' | 'INVITED' | 'SUSPENDED';

/** The join table that makes a user a tenant of an organization — map.md §6. */
@Schema({ collection: 'organization_members', timestamps: true })
export class OrganizationMember {
  @Prop({ type: Types.ObjectId, required: true, index: true })
  organizationId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true, index: true })
  userId!: Types.ObjectId;

  @Prop({ type: String, required: true, enum: Roles })
  role!: Role;

  @Prop({ type: String, default: 'ACTIVE', enum: ['ACTIVE', 'INVITED', 'SUSPENDED'] })
  status!: MemberStatus;

  @Prop({ type: Date, default: null })
  joinedAt!: Date | null;

  @Prop({ type: Types.ObjectId, default: null })
  invitedById!: Types.ObjectId | null;
}

export type OrganizationMemberDocument = HydratedDocument<OrganizationMember>;
export const OrganizationMemberSchema = SchemaFactory.createForClass(OrganizationMember);

OrganizationMemberSchema.index({ organizationId: 1, userId: 1 }, { unique: true });
