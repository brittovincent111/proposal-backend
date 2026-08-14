import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export const BlogPostStatuses = ['DRAFT', 'PUBLISHED', 'ARCHIVED'] as const;
export type BlogPostStatus = (typeof BlogPostStatuses)[number];

/**
 * Marketing-site articles managed by the platform team.
 *
 * They are global to the product rather than tenant-scoped, so there is no
 * organizationId here. Public pages read only published posts.
 */
@Schema({ collection: 'blog_posts', timestamps: true })
export class BlogPost {
  @Prop({ required: true, trim: true, maxlength: 180 })
  title!: string;

  @Prop({ required: true, trim: true, lowercase: true, maxlength: 180 })
  slug!: string;

  @Prop({ default: '', trim: true, maxlength: 320 })
  excerpt!: string;

  @Prop({ default: '' })
  contentHtml!: string;

  @Prop({ type: [String], default: [] })
  tags!: string[];

  @Prop({ type: String, default: null, trim: true })
  coverImageUrl!: string | null;

  @Prop({ type: String, default: null, trim: true })
  authorName!: string | null;

  @Prop({ type: String, default: null, trim: true, maxlength: 180 })
  seoTitle!: string | null;

  @Prop({ type: String, default: null, trim: true, maxlength: 320 })
  seoDescription!: string | null;

  @Prop({ type: String, default: null, trim: true })
  canonicalUrl!: string | null;

  @Prop({ type: String, default: null, trim: true })
  ogImageUrl!: string | null;

  @Prop({ type: String, enum: BlogPostStatuses, default: 'DRAFT' })
  status!: BlogPostStatus;

  @Prop({ type: Date, default: null })
  publishedAt!: Date | null;

  @Prop({ default: 1, min: 1 })
  readingMinutes!: number;

  @Prop({ type: Types.ObjectId, default: null })
  createdById!: Types.ObjectId | null;

  @Prop({ type: Types.ObjectId, default: null })
  updatedById!: Types.ObjectId | null;

  @Prop({ type: Date, default: null })
  archivedAt!: Date | null;
}

export type BlogPostDocument = HydratedDocument<BlogPost>;
export const BlogPostSchema = SchemaFactory.createForClass(BlogPost);

BlogPostSchema.index({ slug: 1 }, { unique: true });
BlogPostSchema.index({ status: 1, publishedAt: -1 });
BlogPostSchema.index({ updatedAt: -1 });
