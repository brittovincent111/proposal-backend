import { Injectable, HttpStatus } from '@nestjs/common';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types, isValidObjectId } from 'mongoose';
import { z } from 'zod';

import { DomainException } from 'src/common/errors/domain.exception';
import { ErrorCodes } from 'src/common/errors/error-codes';
import type { AuthenticatedUser } from 'src/common/context/request-context';
import { BlogPost, BlogPostDocument } from './blog-post.schema';
import {
  BlogTopicRecommendation,
  BlogTopicRecommendationDocument,
} from './blog-topic-recommendation.schema';
import { FindNextBlogTopicDto, GenerateBlogDraftDto } from './dto/blog.dto';
import { BlogService } from './blog.service';

const DEFAULT_OPENAI_TOPIC_MODEL = 'gpt-4.1-mini';
const DEFAULT_TOPIC_PROMPT_FILE = 'blog.md';

const TopicSelectionSchema = z.object({
  topic: z.string().min(4),
  recommendedTitleDirection: z.string().optional().default(''),
  primaryKeyword: z.string().min(2),
  secondaryKeywords: z.array(z.string()).optional().default([]),
  searchIntent: z.array(z.string()).optional().default([]),
  targetMarket: z.string().optional().default('IN'),
  targetIndustry: z.string().nullable().optional(),
  contentType: z.string().optional().default(''),
  whyNow: z.string().optional().default(''),
  searchOpportunity: z.string().optional().default(''),
  currentMarketConnection: z
    .object({
      exists: z.boolean().optional().default(false),
      summary: z.string().optional().default(''),
      relevance: z.string().optional().default('IRRELEVANT'),
    })
    .optional()
    .default({ exists: false, summary: '', relevance: 'IRRELEVANT' }),
  contentGap: z.array(z.string()).optional().default([]),
  originalValueWeCanAdd: z.array(z.string()).optional().default([]),
  conversionPath: z.string().optional().default(''),
  existingContentAction: z.string().optional().default('CREATE_NEW'),
  existingRelatedPostId: z.string().nullable().optional(),
  cannibalizationRisk: z.string().optional().default('LOW'),
  priorityScore: z.number().min(0).max(100).optional().default(0),
  recommendedArticleAngle: z.string().optional().default(''),
  questionsArticleMustAnswer: z.array(z.string()).optional().default([]),
  sources: z.array(z.string()).optional().default([]),
});

const TopicRecommendationResponseSchema = z.object({
  selectedTopic: TopicSelectionSchema,
  backupTopics: z
    .array(
      z.object({
        topic: z.string().min(2),
        primaryKeyword: z.string().min(2),
        intent: z.string().min(2),
        priorityScore: z.number().min(0).max(100).optional().default(0),
        reason: z.string().optional().default(''),
      }),
    )
    .optional()
    .default([]),
  rejectedImportantCandidates: z
    .array(
      z.object({
        topic: z.string().min(2),
        reasonRejected: z.string().optional().default(''),
      }),
    )
    .optional()
    .default([]),
  researchSummary: z
    .object({
      existingArticlesChecked: z.number().min(0).optional().default(0),
      candidatesEvaluated: z.number().min(0).optional().default(0),
      currentSourcesChecked: z.number().min(0).optional().default(0),
      researchedAt: z.string().optional().default(''),
    })
    .optional()
    .default({
      existingArticlesChecked: 0,
      candidatesEvaluated: 0,
      currentSourcesChecked: 0,
      researchedAt: '',
    }),
});

@Injectable()
export class AiBlogTopicService {
  constructor(
    @InjectModel(BlogPost.name)
    private readonly posts: Model<BlogPostDocument>,
    @InjectModel(BlogTopicRecommendation.name)
    private readonly recommendations: Model<BlogTopicRecommendationDocument>,
    private readonly blogService: BlogService,
  ) {}

  async listRecommendations() {
    const rows = await this.recommendations.find({}).sort({ updatedAt: -1 }).lean();
    return rows.map((row) => this.presentRecommendation(row));
  }

  async findNextTopic(input: FindNextBlogTopicDto, user?: AuthenticatedUser) {
    const apiKey = process.env.OPENAI_API_KEY?.trim();
    if (!apiKey) {
      throw DomainException.invalid(
        ErrorCodes.BLOG_TOPIC_RESEARCH_NOT_CONFIGURED,
        'Set OPENAI_API_KEY on the API before researching the next blog topic.',
      );
    }

    const prompt = await readTopicPrompt();
    const existingPosts = await this.posts.find({}).sort({ updatedAt: -1 }).lean();
    const existingMap = existingPosts.map(asExistingTopicEntry);
    const model = process.env.OPENAI_BLOG_TOPIC_MODEL?.trim() || DEFAULT_OPENAI_TOPIC_MODEL;

    let response: Response;
    try {
      response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          temperature: 0.3,
          messages: [
            {
              role: 'system',
              content: [
                'You are the SEO Topic Research and Selection Agent for QuoteProposal.',
                'Return strict JSON only.',
                prompt,
              ].join('\n\n'),
            },
            {
              role: 'user',
              content: buildTopicResearchPrompt(input, existingMap),
            },
          ],
        }),
      });
    } catch {
      throw new DomainException(
        ErrorCodes.BLOG_TOPIC_RESEARCH_FAILED,
        'The topic research request could not reach OpenAI.',
        HttpStatus.BAD_GATEWAY,
      );
    }

    const payload = (await response.json().catch(() => null)) as Record<string, any> | null;
    if (!response.ok) {
      throw new DomainException(
        ErrorCodes.BLOG_TOPIC_RESEARCH_FAILED,
        readOpenAiErrorMessage(payload, 'OpenAI topic research failed.'),
        HttpStatus.BAD_GATEWAY,
      );
    }

    const content = readChatCompletionContent(payload);
    if (!content) {
      throw new DomainException(
        ErrorCodes.BLOG_TOPIC_RESEARCH_INVALID,
        'OpenAI returned an empty topic recommendation.',
        HttpStatus.BAD_GATEWAY,
      );
    }

    const parsed = tryParseJsonObject(content);
    if (!parsed) {
      throw new DomainException(
        ErrorCodes.BLOG_TOPIC_RESEARCH_INVALID,
        'OpenAI returned topic research in an unexpected format.',
        HttpStatus.BAD_GATEWAY,
      );
    }

    const result = TopicRecommendationResponseSchema.safeParse(parsed);
    if (!result.success) {
      throw new DomainException(
        ErrorCodes.BLOG_TOPIC_RESEARCH_INVALID,
        'OpenAI returned a topic recommendation missing required fields.',
        HttpStatus.BAD_GATEWAY,
        result.error.issues,
      );
    }

    const normalized = normalizeTopicRecommendation(result.data, existingMap);
    const actorId = toObjectId(user?.userId);
    const created = await this.recommendations.create({
      market: normalizeNullable(input.market) ?? 'IN',
      language: normalizeNullable(input.language) ?? 'en',
      targetIndustry: normalizeNullable(input.targetIndustry),
      contentType: normalizeNullable(input.contentType),
      notes: normalizeNullable(input.notes),
      ...normalized,
      existingTopicMap: existingMap.map((entry) => `${entry.title} | ${entry.slug} | ${entry.tags.join(', ')}`),
      status: 'RECOMMENDED',
      createdById: actorId,
      updatedById: actorId,
      failureReason: null,
    });

    return this.presentRecommendation(created.toObject());
  }

  async approveAndGenerate(id: string, user?: AuthenticatedUser) {
    const recommendation = await this.findRecommendationById(id);
    const selected = recommendation.selectedTopic;
    const keywords = uniqueStrings([selected.primaryKeyword, ...selected.secondaryKeywords]);

    const notes = [
      selected.recommendedArticleAngle ? `Recommended article angle: ${selected.recommendedArticleAngle}` : null,
      selected.whyNow ? `Why now: ${selected.whyNow}` : null,
      selected.searchOpportunity ? `Search opportunity: ${selected.searchOpportunity}` : null,
      selected.contentGap.length ? `Content gaps to cover:\n- ${selected.contentGap.join('\n- ')}` : null,
      selected.originalValueWeCanAdd.length
        ? `Original value we can add:\n- ${selected.originalValueWeCanAdd.join('\n- ')}`
        : null,
      selected.questionsArticleMustAnswer.length
        ? `Questions the article must answer:\n- ${selected.questionsArticleMustAnswer.join('\n- ')}`
        : null,
      recommendation.notes ? `Extra operator notes: ${recommendation.notes}` : null,
    ]
      .filter(Boolean)
      .join('\n\n');

    const post = await this.blogService.generateDraft(
      {
        topic: selected.topic,
        angle: normalizeNullable(selected.recommendedTitleDirection) ?? normalizeNullable(selected.recommendedArticleAngle) ?? undefined,
        keywords,
        notes: notes || undefined,
      } satisfies GenerateBlogDraftDto,
      user,
    );

    recommendation.status = 'GENERATED';
    recommendation.generatedPostId = new Types.ObjectId(post.id);
    recommendation.generatedAt = new Date();
    recommendation.updatedById = toObjectId(user?.userId);
    recommendation.failureReason = null;
    await recommendation.save();

    return {
      recommendation: this.presentRecommendation(recommendation.toObject()),
      post,
    };
  }

  private async findRecommendationById(id: string) {
    if (!isValidObjectId(id)) {
      throw DomainException.notFound(
        ErrorCodes.BLOG_TOPIC_RECOMMENDATION_NOT_FOUND,
        'That blog topic recommendation does not exist.',
      );
    }

    const row = await this.recommendations.findById(new Types.ObjectId(id));
    if (!row) {
      throw DomainException.notFound(
        ErrorCodes.BLOG_TOPIC_RECOMMENDATION_NOT_FOUND,
        'That blog topic recommendation does not exist.',
      );
    }

    return row;
  }

  private presentRecommendation(row: Record<string, any>) {
    return {
      id: row._id?.toString?.() ?? row.id,
      market: row.market ?? 'IN',
      language: row.language ?? 'en',
      targetIndustry: row.targetIndustry ?? null,
      contentType: row.contentType ?? null,
      notes: row.notes ?? null,
      selectedTopic: row.selectedTopic,
      backupTopics: row.backupTopics ?? [],
      rejectedImportantCandidates: row.rejectedImportantCandidates ?? [],
      researchSummary: row.researchSummary ?? {
        existingArticlesChecked: 0,
        candidatesEvaluated: 0,
        currentSourcesChecked: 0,
        researchedAt: null,
      },
      existingTopicMap: row.existingTopicMap ?? [],
      status: row.status,
      generatedPostId: row.generatedPostId?.toString?.() ?? row.generatedPostId ?? null,
      generatedAt: row.generatedAt instanceof Date ? row.generatedAt.toISOString() : row.generatedAt ?? null,
      failureReason: row.failureReason ?? null,
      createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : row.createdAt ?? null,
      updatedAt: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : row.updatedAt ?? null,
    };
  }
}

async function readTopicPrompt(): Promise<string> {
  const candidates = [
    path.resolve(process.cwd(), DEFAULT_TOPIC_PROMPT_FILE),
    path.resolve(process.cwd(), 'qtn-api', DEFAULT_TOPIC_PROMPT_FILE),
  ];

  for (const candidate of candidates) {
    try {
      const contents = await readFile(candidate, 'utf8');
      if (contents.trim()) return contents;
    } catch {
      // try the next path
    }
  }

  throw DomainException.invalid(
    ErrorCodes.BLOG_TOPIC_RESEARCH_NOT_CONFIGURED,
    'The topic-selection prompt file blog.md could not be read.',
  );
}

function buildTopicResearchPrompt(
  input: FindNextBlogTopicDto,
  existingMap: ReturnType<typeof asExistingTopicEntry>[],
): string {
  return [
    'Use the following existing blog/topic data before selecting the next topic.',
    JSON.stringify(existingMap, null, 2),
    '',
    'Research request:',
    JSON.stringify(
      {
        market: normalizeNullable(input.market) ?? 'IN',
        language: normalizeNullable(input.language) ?? 'en',
        targetIndustry: normalizeNullable(input.targetIndustry),
        contentType: normalizeNullable(input.contentType),
        notes: normalizeNullable(input.notes),
        today: '2026-08-16',
      },
      null,
      2,
    ),
  ].join('\n');
}

function asExistingTopicEntry(row: Record<string, any>) {
  return {
    id: row._id?.toString?.() ?? row.id,
    title: typeof row.title === 'string' ? row.title : '',
    slug: typeof row.slug === 'string' ? row.slug : '',
    excerpt: typeof row.excerpt === 'string' ? row.excerpt : '',
    status: typeof row.status === 'string' ? row.status : 'DRAFT',
    publishedAt: row.publishedAt instanceof Date ? row.publishedAt.toISOString() : row.publishedAt ?? null,
    updatedAt: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : row.updatedAt ?? null,
    tags: Array.isArray(row.tags) ? row.tags.filter((entry): entry is string => typeof entry === 'string') : [],
    authorName: typeof row.authorName === 'string' ? row.authorName : null,
    seoTitle: typeof row.seoTitle === 'string' ? row.seoTitle : null,
    seoDescription: typeof row.seoDescription === 'string' ? row.seoDescription : null,
  };
}

function normalizeTopicRecommendation(
  input: z.infer<typeof TopicRecommendationResponseSchema>,
  existingMap: ReturnType<typeof asExistingTopicEntry>[],
) {
  const selectedTopic = {
    ...input.selectedTopic,
    topic: input.selectedTopic.topic.trim(),
    recommendedTitleDirection: normalizeNullable(input.selectedTopic.recommendedTitleDirection),
    primaryKeyword: input.selectedTopic.primaryKeyword.trim(),
    secondaryKeywords: uniqueStrings(input.selectedTopic.secondaryKeywords),
    searchIntent: uniqueStrings(input.selectedTopic.searchIntent),
    targetMarket: normalizeNullable(input.selectedTopic.targetMarket) ?? 'IN',
    targetIndustry: normalizeNullable(input.selectedTopic.targetIndustry),
    contentType: normalizeNullable(input.selectedTopic.contentType),
    whyNow: trimOrEmpty(input.selectedTopic.whyNow),
    searchOpportunity: trimOrEmpty(input.selectedTopic.searchOpportunity),
    currentMarketConnection: {
      exists: Boolean(input.selectedTopic.currentMarketConnection?.exists),
      summary: trimOrEmpty(input.selectedTopic.currentMarketConnection?.summary),
      relevance: normalizeNullable(input.selectedTopic.currentMarketConnection?.relevance) ?? 'IRRELEVANT',
    },
    contentGap: uniqueStrings(input.selectedTopic.contentGap),
    originalValueWeCanAdd: uniqueStrings(input.selectedTopic.originalValueWeCanAdd),
    conversionPath: trimOrEmpty(input.selectedTopic.conversionPath),
    existingContentAction: normalizeNullable(input.selectedTopic.existingContentAction) ?? 'CREATE_NEW',
    existingRelatedPostId: normalizeNullable(input.selectedTopic.existingRelatedPostId),
    cannibalizationRisk: normalizeNullable(input.selectedTopic.cannibalizationRisk) ?? 'LOW',
    priorityScore: Math.max(0, Math.min(100, Math.round(input.selectedTopic.priorityScore))),
    recommendedArticleAngle: trimOrEmpty(input.selectedTopic.recommendedArticleAngle),
    questionsArticleMustAnswer: uniqueStrings(input.selectedTopic.questionsArticleMustAnswer),
    sources: uniqueStrings(input.selectedTopic.sources),
  };

  const duplicateCheck = findClosestExisting(selectedTopic, existingMap);
  if (duplicateCheck.risk === 'HIGH') {
    selectedTopic.cannibalizationRisk = 'HIGH';
    selectedTopic.existingContentAction = 'UPDATE_EXISTING';
    selectedTopic.existingRelatedPostId = duplicateCheck.postId;
    selectedTopic.priorityScore = Math.max(0, selectedTopic.priorityScore - 20);
  } else if (duplicateCheck.risk === 'MEDIUM' && selectedTopic.cannibalizationRisk === 'LOW') {
    selectedTopic.cannibalizationRisk = 'MEDIUM';
    selectedTopic.priorityScore = Math.max(0, selectedTopic.priorityScore - 8);
  }

  return {
    selectedTopic,
    backupTopics: input.backupTopics.slice(0, 4).map((topic) => ({
      topic: topic.topic.trim(),
      primaryKeyword: topic.primaryKeyword.trim(),
      intent: topic.intent.trim(),
      priorityScore: Math.max(0, Math.min(100, Math.round(topic.priorityScore))),
      reason: trimOrEmpty(topic.reason),
    })),
    rejectedImportantCandidates: input.rejectedImportantCandidates.slice(0, 8).map((candidate) => ({
      topic: candidate.topic.trim(),
      reasonRejected: trimOrEmpty(candidate.reasonRejected),
    })),
    researchSummary: {
      existingArticlesChecked: Math.max(
        existingMap.length,
        Math.round(input.researchSummary.existingArticlesChecked || 0),
      ),
      candidatesEvaluated: Math.max(1, Math.round(input.researchSummary.candidatesEvaluated || 0)),
      currentSourcesChecked: Math.max(0, Math.round(input.researchSummary.currentSourcesChecked || 0)),
      researchedAt: normalizeNullable(input.researchSummary.researchedAt) ?? new Date().toISOString(),
    },
  };
}

function findClosestExisting(
  selectedTopic: {
    topic: string;
    primaryKeyword: string;
  },
  existingMap: ReturnType<typeof asExistingTopicEntry>[],
) {
  let best: { risk: 'LOW' | 'MEDIUM' | 'HIGH'; score: number; postId: string | null } = {
    risk: 'LOW',
    score: 0,
    postId: null,
  };

  const candidate = tokenize(`${selectedTopic.topic} ${selectedTopic.primaryKeyword}`);
  for (const row of existingMap) {
    const comparable = tokenize(
      `${row.title} ${row.slug.replace(/-/g, ' ')} ${row.tags.join(' ')} ${row.seoTitle ?? ''}`,
    );
    const score = overlapScore(candidate, comparable);
    if (score > best.score) {
      best = {
        risk: score >= 0.75 ? 'HIGH' : score >= 0.45 ? 'MEDIUM' : 'LOW',
        score,
        postId: row.id,
      };
    }
  }

  return best;
}

function tokenize(input: string): Set<string> {
  return new Set(
    input
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .map((part) => part.trim())
      .filter((part) => part.length >= 3),
  );
}

function overlapScore(left: Set<string>, right: Set<string>): number {
  if (!left.size || !right.size) return 0;
  let shared = 0;
  for (const value of left) {
    if (right.has(value)) shared += 1;
  }

  return shared / Math.max(left.size, right.size);
}

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const rows: string[] = [];
  for (const value of values) {
    const normalized = normalizeNullable(value);
    if (!normalized) continue;
    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push(normalized);
  }
  return rows;
}

function trimOrEmpty(input: string | null | undefined): string {
  return normalizeNullable(input) ?? '';
}

function normalizeNullable(input: string | null | undefined): string | null {
  const trimmed = (input ?? '').trim();
  return trimmed || null;
}

function toObjectId(value: string | undefined): Types.ObjectId | null {
  return value && isValidObjectId(value) ? new Types.ObjectId(value) : null;
}

function readChatCompletionContent(payload: Record<string, any> | null): string | null {
  const firstChoice = payload?.choices?.[0];
  const content = firstChoice?.message?.content;

  if (typeof content === 'string') return stripCodeFence(content);

  if (Array.isArray(content)) {
    const text = content
      .map((entry) => (entry && typeof entry.text === 'string' ? entry.text : ''))
      .join('')
      .trim();
    return text ? stripCodeFence(text) : null;
  }

  return null;
}

function stripCodeFence(input: string): string {
  return input.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
}

function tryParseJsonObject(input: string): Record<string, unknown> | null {
  const candidate = stripCodeFence(input);
  const parsed = tryParseJson(candidate);
  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
    return parsed as Record<string, unknown>;
  }

  const firstBrace = candidate.indexOf('{');
  const lastBrace = candidate.lastIndexOf('}');
  if (firstBrace === -1 || lastBrace === -1 || firstBrace >= lastBrace) return null;

  const fallback = tryParseJson(candidate.slice(firstBrace, lastBrace + 1));
  if (fallback && typeof fallback === 'object' && !Array.isArray(fallback)) {
    return fallback as Record<string, unknown>;
  }

  return null;
}

function tryParseJson(input: string): unknown {
  try {
    return JSON.parse(input);
  } catch {
    return null;
  }
}

function readOpenAiErrorMessage(
  payload: Record<string, any> | null,
  fallback: string,
): string {
  const message = payload?.error?.message;
  if (typeof message === 'string' && message.trim()) {
    return `${fallback.replace(/\.$/, '')}: ${message.trim()}`;
  }

  return fallback;
}
