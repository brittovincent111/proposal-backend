import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type TemplateStatus = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';

/**
 * The template identity. Content lives in TemplateVersion — map.md §8.
 *
 * `activeVersionId` is what new documents pin to; `draftVersionId` is the
 * editable working copy. Publishing promotes draft → active and starts a fresh
 * draft, so a published version is never edited in place.
 */
@Schema({ collection: 'templates', timestamps: true })
export class Template {
  @Prop({ type: Types.ObjectId, required: true, index: true })
  organizationId!: Types.ObjectId;

  @Prop({ required: true, trim: true })
  name!: string;

  @Prop({ default: '' })
  description!: string;

  @Prop({ default: 'General', trim: true })
  category!: string;

  @Prop({ default: '', trim: true })
  industry!: string;

  @Prop({ type: Types.ObjectId, default: null })
  businessCategoryId!: Types.ObjectId | null;

  @Prop({ type: String, default: null })
  thumbnailUrl!: string | null;

  @Prop({ type: String, default: 'DRAFT', enum: ['DRAFT', 'PUBLISHED', 'ARCHIVED'] })
  status!: TemplateStatus;

  @Prop({ type: Types.ObjectId, default: null })
  activeVersionId!: Types.ObjectId | null;

  @Prop({ type: Types.ObjectId, default: null })
  draftVersionId!: Types.ObjectId | null;

  @Prop({ default: 0, min: 0 })
  usageCount!: number;

  @Prop({ type: Types.ObjectId, default: null })
  createdById!: Types.ObjectId | null;

  @Prop({ type: Date, default: null })
  archivedAt!: Date | null;
}

export type TemplateDocument = HydratedDocument<Template>;
export const TemplateSchema = SchemaFactory.createForClass(Template);

TemplateSchema.index({ organizationId: 1, name: 1 });
TemplateSchema.index({ organizationId: 1, status: 1 });
TemplateSchema.index({ organizationId: 1, businessCategoryId: 1, updatedAt: -1 });
