import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type ItemType = 'PRODUCT' | 'SERVICE';

/** A reusable priced thing. Documents snapshot it; they never read back through it. */
@Schema({ collection: 'items', timestamps: true })
export class Item {
  @Prop({ type: Types.ObjectId, required: true, index: true })
  organizationId!: Types.ObjectId;

  @Prop({ required: true, trim: true })
  name!: string;

  @Prop({ default: '' })
  description!: string;

  @Prop({ type: String, default: 'SERVICE', enum: ['PRODUCT', 'SERVICE'] })
  type!: ItemType;

  @Prop({ default: 'General', trim: true })
  category!: string;

  @Prop({ default: 'nos' })
  unit!: string;

  /** Minor units — map.md §20. */
  @Prop({ default: 0, min: 0 })
  defaultRate!: number;

  @Prop({ type: Types.ObjectId, default: null })
  taxRateId!: Types.ObjectId | null;

  /** Bumped when a document that uses this item is sent; drives "most used" ordering. */
  @Prop({ default: 0, min: 0 })
  usageCount!: number;

  @Prop({ type: Types.ObjectId, default: null })
  createdById!: Types.ObjectId | null;

  /** Archive rather than delete so historical documents keep their provenance (map.md §42). */
  @Prop({ type: Date, default: null })
  archivedAt!: Date | null;
}

export type ItemDocument = HydratedDocument<Item>;
export const ItemSchema = SchemaFactory.createForClass(Item);

ItemSchema.index({ organizationId: 1, name: 1 });
ItemSchema.index({ organizationId: 1, category: 1 });
ItemSchema.index({ organizationId: 1, usageCount: -1 });
