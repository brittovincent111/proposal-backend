import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import sanitizeHtml from 'sanitize-html';
import { Model, Types, isValidObjectId } from 'mongoose';
import { z } from 'zod';

import { DomainException } from 'src/common/errors/domain.exception';
import { ErrorCodes } from 'src/common/errors/error-codes';
import type { AuthenticatedUser } from 'src/common/context/request-context';
import { BLOG_DRAFTING_RULES } from './blog-drafting-rules';
import { BlogPost, BlogPostDocument, BlogPostStatus } from './blog-post.schema';
import { CreateBlogPostDto, GenerateBlogDraftDto, UpdateBlogPostDto } from './dto/blog.dto';

const BLOG_SANITIZE: sanitizeHtml.IOptions = {
  allowedTags: [
    'a',
    'b',
    'blockquote',
    'br',
    'code',
    'em',
    'figure',
    'figcaption',
    'h2',
    'h3',
    'h4',
    'hr',
    'img',
    'i',
    'li',
    'ol',
    'p',
    'pre',
    'strong',
    'u',
    'ul',
  ],
  allowedAttributes: {
    a: ['href', 'title', 'target', 'rel'],
    img: ['src', 'alt', 'title'],
  },
  allowedSchemes: ['http', 'https', 'mailto', 'tel'],
  transformTags: {
    a: sanitizeHtml.simpleTransform('a', {
      rel: 'noopener noreferrer',
      target: '_blank',
    }),
  },
  disallowedTagsMode: 'discard',
};

const DEFAULT_AUTHOR = 'QuoteProposal Team';
const DEFAULT_OPENAI_BLOG_MODEL = 'gpt-4.1-mini';

const GeneratedBlogDraftSchema = z.object({
  title: z.string().min(8),
  slug: z.string().optional().default(''),
  excerpt: z.string().optional().default(''),
  contentHtml: z.string().min(120),
  tags: z.array(z.string()).optional().default([]),
  coverImageUrl: z.string().nullable().optional(),
  authorName: z.string().nullable().optional(),
  seoTitle: z.string().nullable().optional(),
  seoDescription: z.string().nullable().optional(),
  canonicalUrl: z.string().nullable().optional(),
  ogImageUrl: z.string().nullable().optional(),
});

@Injectable()
export class BlogService {
  constructor(
    @InjectModel(BlogPost.name)
    private readonly posts: Model<BlogPostDocument>,
  ) {}

  async listPublic() {
    const rows = await this.posts
      .find({ status: 'PUBLISHED', publishedAt: { $ne: null }, archivedAt: null })
      .sort({ publishedAt: -1, updatedAt: -1 })
      .lean();

    return rows.map((row) => this.present(row));
  }

  async getPublicBySlug(slug: string) {
    const row = await this.posts
      .findOne({
        slug: normalizeSlug(slug),
        status: 'PUBLISHED',
        publishedAt: { $ne: null },
        archivedAt: null,
      })
      .lean();

    if (!row) {
      throw DomainException.notFound(
        ErrorCodes.BLOG_POST_NOT_FOUND,
        'That blog post does not exist.',
      );
    }

    return this.present(row);
  }

  async listAdmin() {
    const rows = await this.posts.find({}).sort({ updatedAt: -1 }).lean();
    return rows.map((row) => this.present(row));
  }

  async getAdminById(id: string) {
    const row = await this.findById(id);
    return this.present(row.toObject());
  }

  async create(body: CreateBlogPostDto, user?: AuthenticatedUser) {
    const slug = normalizeSlug(body.slug);
    await this.assertSlugAvailable(slug);

    const status = body.status ?? 'DRAFT';
    const contentHtml = sanitizeContent(body.contentHtml);
    const excerpt = normalizeExcerpt(body.excerpt, contentHtml);
    const publishedAt = resolvePublishedAt(status, body.publishedAt);
    const actorId = toObjectId(user?.userId);

    const created = await this.posts.create({
      title: body.title.trim(),
      slug,
      excerpt,
      contentHtml,
      tags: normalizeTags(body.tags),
      coverImageUrl: normalizeNullable(body.coverImageUrl),
      authorName: normalizeNullable(body.authorName) ?? DEFAULT_AUTHOR,
      seoTitle: normalizeNullable(body.seoTitle),
      seoDescription: normalizeNullable(body.seoDescription),
      canonicalUrl: normalizeNullable(body.canonicalUrl),
      ogImageUrl: normalizeNullable(body.ogImageUrl),
      status,
      publishedAt,
      readingMinutes: estimateReadingMinutes(contentHtml),
      createdById: actorId,
      updatedById: actorId,
      archivedAt: status === 'ARCHIVED' ? new Date() : null,
    });

    return this.present(created.toObject());
  }

  async generateDraft(body: GenerateBlogDraftDto, user?: AuthenticatedUser) {
    const aiDraft = await this.generateAiDraft(body);
    const slug = await this.nextAvailableSlug(aiDraft.slug || aiDraft.title || body.topic);

    return this.create(
      {
        title: limitText(aiDraft.title, 180) ?? body.topic.trim().slice(0, 180),
        slug,
        excerpt: limitText(aiDraft.excerpt, 320) ?? undefined,
        contentHtml: aiDraft.contentHtml,
        tags: normalizeTags([...(aiDraft.tags ?? []), ...(body.keywords ?? [])]).slice(0, 10),
        coverImageUrl: normalizeHttpUrl(aiDraft.coverImageUrl),
        authorName: limitText(aiDraft.authorName, 120),
        seoTitle: limitText(aiDraft.seoTitle, 180),
        seoDescription: limitText(aiDraft.seoDescription, 320),
        canonicalUrl: normalizeHttpUrl(aiDraft.canonicalUrl),
        ogImageUrl: normalizeHttpUrl(aiDraft.ogImageUrl),
        status: 'DRAFT',
        publishedAt: null,
      },
      user,
    );
  }

  async update(id: string, body: UpdateBlogPostDto, user?: AuthenticatedUser) {
    const post = await this.findById(id);

    if (body.slug !== undefined) {
      const slug = normalizeSlug(body.slug);
      if (slug !== post.slug) {
        await this.assertSlugAvailable(slug, post._id);
        post.slug = slug;
      }
    }

    if (body.title !== undefined) post.title = body.title.trim();
    if (body.excerpt !== undefined) post.excerpt = normalizeNullable(body.excerpt) ?? '';
    if (body.contentHtml !== undefined) post.contentHtml = sanitizeContent(body.contentHtml);
    if (body.tags !== undefined) post.tags = normalizeTags(body.tags);
    if (body.coverImageUrl !== undefined) post.coverImageUrl = normalizeNullable(body.coverImageUrl);
    if (body.authorName !== undefined) {
      post.authorName = normalizeNullable(body.authorName) ?? DEFAULT_AUTHOR;
    }
    if (body.seoTitle !== undefined) post.seoTitle = normalizeNullable(body.seoTitle);
    if (body.seoDescription !== undefined) {
      post.seoDescription = normalizeNullable(body.seoDescription);
    }
    if (body.canonicalUrl !== undefined) {
      post.canonicalUrl = normalizeNullable(body.canonicalUrl);
    }
    if (body.ogImageUrl !== undefined) post.ogImageUrl = normalizeNullable(body.ogImageUrl);

    if (body.status !== undefined) {
      post.status = body.status;
      post.archivedAt = body.status === 'ARCHIVED' ? new Date() : null;
    }

    if (body.publishedAt !== undefined || body.status !== undefined) {
      post.publishedAt = resolvePublishedAt(
        post.status,
        body.publishedAt ?? post.publishedAt?.toISOString() ?? null,
      );
    }

    if (!post.excerpt.trim()) {
      post.excerpt = normalizeExcerpt(post.excerpt, post.contentHtml);
    }

    post.readingMinutes = estimateReadingMinutes(post.contentHtml);
    post.updatedById = toObjectId(user?.userId);

    await post.save();
    return this.present(post.toObject());
  }

  private async findById(id: string) {
    if (!isValidObjectId(id)) {
      throw DomainException.notFound(
        ErrorCodes.BLOG_POST_NOT_FOUND,
        'That blog post does not exist.',
      );
    }

    const row = await this.posts.findById(new Types.ObjectId(id));
    if (!row) {
      throw DomainException.notFound(
        ErrorCodes.BLOG_POST_NOT_FOUND,
        'That blog post does not exist.',
      );
    }
    return row;
  }

  private async assertSlugAvailable(slug: string, excludeId?: Types.ObjectId) {
    const filter: Record<string, unknown> = { slug };
    if (excludeId) filter._id = { $ne: excludeId };

    const existing = await this.posts.findOne(filter).select({ _id: 1 }).lean();
    if (existing) {
      throw DomainException.conflict(
        ErrorCodes.BLOG_POST_SLUG_TAKEN,
        'That slug is already in use by another blog post.',
      );
    }
  }

  private async nextAvailableSlug(seed: string) {
    const fallback = `blog-${new Date().toISOString().slice(0, 10)}`;
    const base = normalizeSlug(seed) || fallback;

    let slug = base;
    let attempt = 2;
    while (await this.posts.findOne({ slug }).select({ _id: 1 }).lean()) {
      const suffix = `-${attempt}`;
      slug = `${base.slice(0, Math.max(1, 180 - suffix.length)).replace(/-+$/g, '')}${suffix}`;
      attempt += 1;
    }

    return slug;
  }

  private async generateAiDraft(input: GenerateBlogDraftDto) {
    const apiKey = process.env.OPENAI_API_KEY?.trim();
    if (!apiKey) {
      throw DomainException.invalid(
        ErrorCodes.BLOG_DRAFTING_NOT_CONFIGURED,
        'Set OPENAI_API_KEY on the API before generating blog drafts.',
      );
    }

    const model = process.env.OPENAI_BLOG_MODEL?.trim() || DEFAULT_OPENAI_BLOG_MODEL;

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
          temperature: 0.7,
          messages: [
            {
              role: 'system',
              content: [
                'You are an expert SaaS content strategist and blog editor.',
                'Follow the house rules exactly and return raw JSON only.',
                BLOG_DRAFTING_RULES,
              ].join('\n\n'),
            },
            {
              role: 'user',
              content: buildDraftPrompt(input),
            },
          ],
        }),
      });
    } catch {
      throw new DomainException(
        ErrorCodes.BLOG_DRAFT_GENERATION_FAILED,
        'The AI draft request could not reach OpenAI.',
        HttpStatus.BAD_GATEWAY,
      );
    }

    const payload = (await response.json().catch(() => null)) as Record<string, any> | null;
    if (!response.ok) {
      throw new DomainException(
        ErrorCodes.BLOG_DRAFT_GENERATION_FAILED,
        readOpenAiErrorMessage(payload),
        HttpStatus.BAD_GATEWAY,
      );
    }

    const content = readChatCompletionContent(payload);
    if (!content) {
      throw new DomainException(
        ErrorCodes.BLOG_DRAFT_INVALID,
        'OpenAI returned an empty draft.',
        HttpStatus.BAD_GATEWAY,
      );
    }

    const parsedJson = tryParseJsonObject(content);
    if (!parsedJson) {
      throw new DomainException(
        ErrorCodes.BLOG_DRAFT_INVALID,
        'OpenAI returned a draft in an unexpected format.',
        HttpStatus.BAD_GATEWAY,
      );
    }

    const result = GeneratedBlogDraftSchema.safeParse(parsedJson);
    if (!result.success) {
      throw new DomainException(
        ErrorCodes.BLOG_DRAFT_INVALID,
        'OpenAI returned a draft missing required fields.',
        HttpStatus.BAD_GATEWAY,
        result.error.issues,
      );
    }

    return result.data;
  }

  private present(row: Record<string, any>) {
    return {
      id: row._id?.toString?.() ?? row.id,
      title: row.title,
      slug: row.slug,
      excerpt: row.excerpt,
      contentHtml: row.contentHtml,
      tags: row.tags ?? [],
      coverImageUrl: row.coverImageUrl ?? null,
      authorName: row.authorName ?? DEFAULT_AUTHOR,
      seoTitle: row.seoTitle ?? null,
      seoDescription: row.seoDescription ?? null,
      canonicalUrl: row.canonicalUrl ?? null,
      ogImageUrl: row.ogImageUrl ?? null,
      status: row.status,
      publishedAt: row.publishedAt instanceof Date ? row.publishedAt.toISOString() : row.publishedAt ?? null,
      readingMinutes: row.readingMinutes ?? 1,
      createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : row.createdAt ?? null,
      updatedAt: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : row.updatedAt ?? null,
    };
  }
}

function normalizeSlug(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
}

function sanitizeContent(input: string): string {
  return sanitizeHtml(input ?? '', BLOG_SANITIZE).trim();
}

function normalizeTags(input?: string[]): string[] {
  if (!input?.length) return [];
  const seen = new Set<string>();
  return input
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => entry.toLowerCase())
    .filter((entry) => {
      if (seen.has(entry)) return false;
      seen.add(entry);
      return true;
    });
}

function normalizeNullable(input: string | null | undefined): string | null {
  const trimmed = (input ?? '').trim();
  return trimmed ? trimmed : null;
}

function normalizeHttpUrl(input: string | null | undefined): string | null {
  const value = normalizeNullable(input);
  return value && /^https?:\/\//i.test(value) ? value : null;
}

function limitText(input: string | null | undefined, maxLength: number): string | null {
  const value = normalizeNullable(input);
  return value ? value.slice(0, maxLength).trim() : null;
}

function plainText(input: string): string {
  return sanitizeHtml(input ?? '', { allowedTags: [], allowedAttributes: {} }).trim();
}

function normalizeExcerpt(input: string | undefined, contentHtml: string): string {
  const explicit = normalizeNullable(input);
  if (explicit) return explicit;
  const fallback = plainText(contentHtml).replace(/\s+/g, ' ').trim();
  return fallback.slice(0, 220).trim();
}

function estimateReadingMinutes(contentHtml: string): number {
  const words = plainText(contentHtml)
    .split(/\s+/)
    .filter(Boolean).length;
  return Math.max(1, Math.ceil(words / 200));
}

function resolvePublishedAt(status: BlogPostStatus, input: string | null | undefined): Date | null {
  if (status !== 'PUBLISHED') return null;
  if (input) return new Date(input);
  return new Date();
}

function buildDraftPrompt(input: GenerateBlogDraftDto): string {
  const sections = [
    `Topic: ${input.topic.trim()}`,
    input.angle ? `Angle: ${input.angle.trim()}` : null,
    input.keywords?.length ? `Keywords: ${normalizeTags(input.keywords).join(', ')}` : null,
    input.notes ? `Notes: ${input.notes.trim()}` : null,
    [
      'Output requirements:',
      '- Save-ready article draft for the QuoteProposal blog.',
      '- Keep status out of the payload; the application will save it as DRAFT.',
      '- Return JSON only.',
    ].join('\n'),
  ];

  return sections.filter(Boolean).join('\n\n');
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

function readOpenAiErrorMessage(payload: Record<string, any> | null): string {
  const message = payload?.error?.message;
  if (typeof message === 'string' && message.trim()) {
    return `OpenAI draft generation failed: ${message.trim()}`;
  }

  return 'OpenAI draft generation failed.';
}

function toObjectId(value: string | undefined): Types.ObjectId | null {
  return value && isValidObjectId(value) ? new Types.ObjectId(value) : null;
}
