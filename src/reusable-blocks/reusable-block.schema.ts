import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type ReusableBlockStatus = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';

/**
 * A saved chunk of document content — map.md §15.
 *
 * `blockJson` holds template blocks in the same shape a template stores them, so
 * a block can be dropped into a template without translation.
 */
@Schema({ collection: 'reusable_blocks', timestamps: true })
export class ReusableBlock {
  @Prop({ type: Types.ObjectId, required: true, index: true })
  organizationId!: Types.ObjectId;

  @Prop({ required: true, trim: true })
  name!: string;

  @Prop({ default: '' })
  description!: string;

  @Prop({ default: 'General', trim: true })
  category!: string;

  @Prop({ type: [String], default: [] })
  tags!: string[];

  @Prop({ type: Object, required: true })
  blockJson!: Record<string, unknown>;

  @Prop({ type: String, default: 'DRAFT', enum: ['DRAFT', 'PUBLISHED', 'ARCHIVED'] })
  status!: ReusableBlockStatus;

  @Prop({ default: 0, min: 0 })
  usageCount!: number;

  @Prop({ type: Types.ObjectId, default: null })
  createdById!: Types.ObjectId | null;

  @Prop({ type: Date, default: null })
  archivedAt!: Date | null;
}

export type ReusableBlockDocument = HydratedDocument<ReusableBlock>;
export const ReusableBlockSchema = SchemaFactory.createForClass(ReusableBlock);

ReusableBlockSchema.index({ organizationId: 1, name: 1 });
ReusableBlockSchema.index({ organizationId: 1, category: 1 });
