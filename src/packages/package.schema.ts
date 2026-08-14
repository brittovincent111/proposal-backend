import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type PackagePricingMode = 'SUM_OF_ITEMS' | 'FIXED_PRICE' | 'DISCOUNTED_TOTAL';
export type PackageStatus = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';

@Schema({ _id: false })
export class PackageLine {
  @Prop({ required: true }) lineId!: string;
  @Prop({ type: Types.ObjectId, default: null }) itemId!: Types.ObjectId | null;
  @Prop({ required: true }) name!: string;
  @Prop({ default: '' }) description!: string;
  @Prop({ default: 'nos' }) unit!: string;
  @Prop({ default: 1, min: 0 }) quantity!: number;
  /** Minor units. */
  @Prop({ default: 0, min: 0 }) rate!: number;
  @Prop({ type: Types.ObjectId, default: null }) taxRateId!: Types.ObjectId | null;
  @Prop({ default: false }) optional!: boolean;
}
export const PackageLineSchema = SchemaFactory.createForClass(PackageLine);

@Schema({ collection: 'packages', timestamps: true })
export class Package {
  @Prop({ type: Types.ObjectId, required: true, index: true })
  organizationId!: Types.ObjectId;

  @Prop({ required: true, trim: true })
  name!: string;

  @Prop({ default: '' })
  description!: string;

  @Prop({ default: 'General', trim: true })
  category!: string;

  @Prop({ type: [PackageLineSchema], default: [] })
  lines!: PackageLine[];

  @Prop({ type: String, default: 'SUM_OF_ITEMS', enum: ['SUM_OF_ITEMS', 'FIXED_PRICE', 'DISCOUNTED_TOTAL'] })
  pricingMode!: PackagePricingMode;

  /** Used when pricingMode is FIXED_PRICE. Minor units. */
  @Prop({ default: 0, min: 0 })
  fixedPrice!: number;

  /** Used when pricingMode is DISCOUNTED_TOTAL. */
  @Prop({ default: 0, min: 0, max: 100 })
  discountPercent!: number;

  @Prop({ type: String, default: 'DRAFT', enum: ['DRAFT', 'PUBLISHED', 'ARCHIVED'] })
  status!: PackageStatus;

  /**
   * map.md §17: a package edit must not rewrite documents that already quoted it.
   * Documents hold a full snapshot, so this counter is only for the UI.
   */
  @Prop({ default: 1, min: 1 })
  version!: number;

  @Prop({ default: 0, min: 0 })
  usageCount!: number;

  @Prop({ type: Types.ObjectId, default: null })
  createdById!: Types.ObjectId | null;

  @Prop({ type: Date, default: null })
  archivedAt!: Date | null;
}

export type PackageDocument = HydratedDocument<Package>;
export const PackageSchema = SchemaFactory.createForClass(Package);

PackageSchema.index({ organizationId: 1, name: 1 });
PackageSchema.index({ organizationId: 1, status: 1 });
