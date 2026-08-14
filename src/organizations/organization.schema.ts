import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type OrganizationStatus = 'ACTIVE' | 'SUSPENDED';

@Schema({ collection: 'organizations', timestamps: true })
export class Organization {
  @Prop({ required: true, trim: true })
  name!: string;

  @Prop({ required: true, unique: true, lowercase: true, trim: true })
  slug!: string;

  @Prop({ type: String, default: null })
  logoUrl!: string | null;

  @Prop({ default: 'Asia/Kolkata' })
  timezone!: string;

  @Prop({ default: 'INR' })
  defaultCurrency!: string;

  @Prop({ default: 'en-IN' })
  locale!: string;

  @Prop({ default: 'IN' })
  country!: string;

  @Prop({ type: Types.ObjectId, default: null })
  primaryBusinessCategoryId!: Types.ObjectId | null;

  @Prop({ type: String, default: 'ACTIVE', enum: ['ACTIVE', 'SUSPENDED'] })
  status!: OrganizationStatus;
}

export type OrganizationDocument = HydratedDocument<Organization>;
export const OrganizationSchema = SchemaFactory.createForClass(Organization);

OrganizationSchema.index({ slug: 1 }, { unique: true });
