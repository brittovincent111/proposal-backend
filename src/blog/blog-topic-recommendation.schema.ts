import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export const BlogTopicRecommendationStatuses = [
  'RECOMMENDED',
  'GENERATED',
  'DISMISSED',
  'FAILED',
] as const;
export type BlogTopicRecommendationStatus = (typeof BlogTopicRecommendationStatuses)[number];

@Schema({ _id: false })
export class BlogTopicSelection {
  @Prop({ required: true, trim: true })
  topic!: string;

  @Prop({ type: String, default: null, trim: true })
  recommendedTitleDirection!: string | null;

  @Prop({ required: true, trim: true })
  primaryKeyword!: string;

  @Prop({ type: [String], default: [] })
  secondaryKeywords!: string[];

  @Prop({ type: [String], default: [] })
  searchIntent!: string[];

  @Prop({ type: String, default: 'IN', trim: true })
  targetMarket!: string;

  @Prop({ type: String, default: null, trim: true })
  targetIndustry!: string | null;

  @Prop({ type: String, default: null, trim: true })
  contentType!: string | null;

  @Prop({ type: String, default: '', trim: true })
  whyNow!: string;

  @Prop({ type: String, default: '', trim: true })
  searchOpportunity!: string;

  @Prop({
    type: {
      exists: { type: Boolean, default: false },
      summary: { type: String, default: '' },
      relevance: { type: String, default: 'IRRELEVANT' },
    },
    default: () => ({ exists: false, summary: '', relevance: 'IRRELEVANT' }),
  })
  currentMarketConnection!: {
    exists: boolean;
    summary: string;
    relevance: string;
  };

  @Prop({ type: [String], default: [] })
  contentGap!: string[];

  @Prop({ type: [String], default: [] })
  originalValueWeCanAdd!: string[];

  @Prop({ type: String, default: '', trim: true })
  conversionPath!: string;

  @Prop({ type: String, default: 'CREATE_NEW', trim: true })
  existingContentAction!: string;

  @Prop({ type: String, default: null, trim: true })
  existingRelatedPostId!: string | null;

  @Prop({ type: String, default: 'LOW', trim: true })
  cannibalizationRisk!: string;

  @Prop({ default: 0, min: 0, max: 100 })
  priorityScore!: number;

  @Prop({ type: String, default: '', trim: true })
  recommendedArticleAngle!: string;

  @Prop({ type: [String], default: [] })
  questionsArticleMustAnswer!: string[];

  @Prop({ type: [String], default: [] })
  sources!: string[];
}

@Schema({ _id: false })
export class BlogTopicBackup {
  @Prop({ required: true, trim: true })
  topic!: string;

  @Prop({ required: true, trim: true })
  primaryKeyword!: string;

  @Prop({ required: true, trim: true })
  intent!: string;

  @Prop({ default: 0, min: 0, max: 100 })
  priorityScore!: number;

  @Prop({ type: String, default: '', trim: true })
  reason!: string;
}

@Schema({ _id: false })
export class RejectedBlogTopicCandidate {
  @Prop({ required: true, trim: true })
  topic!: string;

  @Prop({ type: String, default: '', trim: true })
  reasonRejected!: string;
}

@Schema({ collection: 'blog_topic_recommendations', timestamps: true })
export class BlogTopicRecommendation {
  @Prop({ type: String, default: 'IN', trim: true })
  market!: string;

  @Prop({ type: String, default: 'en', trim: true })
  language!: string;

  @Prop({ type: String, default: null, trim: true })
  targetIndustry!: string | null;

  @Prop({ type: String, default: null, trim: true })
  contentType!: string | null;

  @Prop({ type: String, default: null, trim: true })
  notes!: string | null;

  @Prop({ type: BlogTopicSelection, required: true })
  selectedTopic!: BlogTopicSelection;

  @Prop({ type: [BlogTopicBackup], default: [] })
  backupTopics!: BlogTopicBackup[];

  @Prop({ type: [RejectedBlogTopicCandidate], default: [] })
  rejectedImportantCandidates!: RejectedBlogTopicCandidate[];

  @Prop({
    type: {
      existingArticlesChecked: { type: Number, default: 0 },
      candidatesEvaluated: { type: Number, default: 0 },
      currentSourcesChecked: { type: Number, default: 0 },
      researchedAt: { type: String, default: null },
    },
    default: () => ({
      existingArticlesChecked: 0,
      candidatesEvaluated: 0,
      currentSourcesChecked: 0,
      researchedAt: null,
    }),
  })
  researchSummary!: {
    existingArticlesChecked: number;
    candidatesEvaluated: number;
    currentSourcesChecked: number;
    researchedAt: string | null;
  };

  @Prop({ type: [String], default: [] })
  existingTopicMap!: string[];

  @Prop({ type: String, enum: BlogTopicRecommendationStatuses, default: 'RECOMMENDED' })
  status!: BlogTopicRecommendationStatus;

  @Prop({ type: Types.ObjectId, default: null })
  generatedPostId!: Types.ObjectId | null;

  @Prop({ type: Types.ObjectId, default: null })
  createdById!: Types.ObjectId | null;

  @Prop({ type: Types.ObjectId, default: null })
  updatedById!: Types.ObjectId | null;

  @Prop({ type: Date, default: null })
  generatedAt!: Date | null;

  @Prop({ type: String, default: null, trim: true })
  failureReason!: string | null;
}

export type BlogTopicRecommendationDocument = HydratedDocument<BlogTopicRecommendation>;
export const BlogTopicRecommendationSchema = SchemaFactory.createForClass(BlogTopicRecommendation);

BlogTopicRecommendationSchema.index({ status: 1, updatedAt: -1 });
BlogTopicRecommendationSchema.index({ 'selectedTopic.priorityScore': -1, updatedAt: -1 });
