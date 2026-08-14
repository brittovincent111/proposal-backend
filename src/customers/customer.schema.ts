import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type CustomerType = 'INDIVIDUAL' | 'BUSINESS';

@Schema({ _id: false })
export class Address {
  @Prop({ default: '' }) line1!: string;
  @Prop({ default: '' }) line2!: string;
  @Prop({ default: '' }) city!: string;
  @Prop({ default: '' }) state!: string;
  @Prop({ default: '' }) postalCode!: string;
  @Prop({ default: '' }) country!: string;
}
export const AddressSchema = SchemaFactory.createForClass(Address);

@Schema({ collection: 'customers', timestamps: true })
export class Customer {
  @Prop({ type: Types.ObjectId, required: true, index: true })
  organizationId!: Types.ObjectId;

  @Prop({ type: String, default: 'BUSINESS', enum: ['INDIVIDUAL', 'BUSINESS'] })
  type!: CustomerType;

  @Prop({ required: true, trim: true })
  name!: string;

  @Prop({ default: '', trim: true })
  companyName!: string;

  @Prop({ default: '', lowercase: true, trim: true })
  email!: string;

  @Prop({ default: '', trim: true })
  phone!: string;

  /** Optional on purpose — map.md §7: this is not accounting software. */
  @Prop({ default: '' })
  taxId!: string;

  @Prop({ type: AddressSchema, default: () => ({}) })
  billingAddress!: Address;

  @Prop({ type: AddressSchema, default: () => ({}) })
  shippingAddress!: Address;

  @Prop({ default: '' })
  notes!: string;

  @Prop({ type: Object, default: {} })
  customFields!: Record<string, unknown>;

  @Prop({ type: Types.ObjectId, default: null })
  createdById!: Types.ObjectId | null;

  @Prop({ type: Date, default: null })
  archivedAt!: Date | null;
}

export type CustomerDocument = HydratedDocument<Customer>;
export const CustomerSchema = SchemaFactory.createForClass(Customer);

CustomerSchema.index({ organizationId: 1, name: 1 });
CustomerSchema.index({ organizationId: 1, email: 1 });
CustomerSchema.index({ organizationId: 1, phone: 1 });
CustomerSchema.index({ organizationId: 1, createdAt: -1 });
