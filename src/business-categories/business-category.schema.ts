import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

@Schema({ collection: 'business_categories', timestamps: true })
export class BusinessCategory {
  @Prop({ required: true, unique: true, lowercase: true, trim: true })
  slug!: string;

  @Prop({ required: true, trim: true })
  name!: string;

  @Prop({ default: '' })
  description!: string;

  @Prop({ type: [String], default: [] })
  starterIds!: string[];

  @Prop({ default: 0, min: 0 })
  sortOrder!: number;

  @Prop({ type: Date, default: null })
  archivedAt!: Date | null;
}

export type BusinessCategoryDocument = HydratedDocument<BusinessCategory>;
export const BusinessCategorySchema = SchemaFactory.createForClass(BusinessCategory);

BusinessCategorySchema.index({ slug: 1 }, { unique: true });
BusinessCategorySchema.index({ sortOrder: 1, name: 1 });
