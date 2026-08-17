import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  MaxLength,
} from 'class-validator';

import { BlogPostStatuses, BlogPostStatus } from '../blog-post.schema';

export class CreateBlogPostDto {
  @ApiProperty({ example: 'How to build a quotation process your team trusts' })
  @IsString()
  @MaxLength(180)
  title!: string;

  @ApiProperty({ example: 'quotation-process-team-trusts' })
  @IsString()
  @MaxLength(180)
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    message: 'slug must use lowercase letters, digits and single hyphens only',
  })
  slug!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(320)
  excerpt?: string;

  @ApiProperty({ description: 'Sanitised HTML content.' })
  @IsString()
  contentHtml!: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsUrl({ require_tld: false })
  coverImageUrl?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  authorName?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(180)
  seoTitle?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(320)
  seoDescription?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUrl({ require_tld: false })
  canonicalUrl?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUrl({ require_tld: false })
  ogImageUrl?: string | null;

  @ApiPropertyOptional({ enum: BlogPostStatuses })
  @IsOptional()
  @IsIn(BlogPostStatuses)
  status?: BlogPostStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  publishedAt?: string | null;
}

export class UpdateBlogPostDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(180)
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(180)
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    message: 'slug must use lowercase letters, digits and single hyphens only',
  })
  slug?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(320)
  excerpt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  contentHtml?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsUrl({ require_tld: false })
  coverImageUrl?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  authorName?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(180)
  seoTitle?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(320)
  seoDescription?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUrl({ require_tld: false })
  canonicalUrl?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUrl({ require_tld: false })
  ogImageUrl?: string | null;

  @ApiPropertyOptional({ enum: BlogPostStatuses })
  @IsOptional()
  @IsIn(BlogPostStatuses)
  status?: BlogPostStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  publishedAt?: string | null;
}

export class GenerateBlogDraftDto {
  @ApiProperty({ example: 'How sales teams can cut proposal turnaround time without rushing approvals' })
  @IsString()
  @MaxLength(180)
  topic!: string;

  @ApiPropertyOptional({ example: 'Focus on service businesses that send quotations every week.' })
  @IsOptional()
  @IsString()
  @MaxLength(240)
  angle?: string;

  @ApiPropertyOptional({ type: [String], example: ['quotation software', 'proposal turnaround time'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  keywords?: string[];

  @ApiPropertyOptional({ example: 'Mention follow-up discipline and approval bottlenecks.' })
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  notes?: string;
}

export class FindNextBlogTopicDto {
  @ApiPropertyOptional({ enum: ['IN', 'GLOBAL'], example: 'IN' })
  @IsOptional()
  @IsString()
  market?: string;

  @ApiPropertyOptional({ example: 'en' })
  @IsOptional()
  @IsString()
  @MaxLength(12)
  language?: string;

  @ApiPropertyOptional({ example: 'CCTV / Security' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  targetIndustry?: string;

  @ApiPropertyOptional({ example: 'industry' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  contentType?: string;

  @ApiPropertyOptional({
    example: 'Prefer a format/template topic that can convert into a practical downloadable-style article.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  notes?: string;
}
