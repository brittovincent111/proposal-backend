import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsIn, IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

import { PaginationQuery } from 'src/common/dto/pagination.dto';

export class CreateTemplateDto {
  @ApiProperty({ example: 'Kerala tour proposal' })
  @IsString()
  @MaxLength(200)
  name!: string;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(2000) description?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(80) category?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(80) industry?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(24) businessCategoryId?: string;

  @ApiPropertyOptional({
    description: 'Optional starter content: { schemaJson, fieldSchemaJson, styleSchemaJson }.',
    type: Object,
  })
  @IsOptional()
  @IsObject()
  draft?: {
    schemaJson?: unknown;
    fieldSchemaJson?: unknown;
    styleSchemaJson?: unknown;
    linesJson?: unknown;
    settingsJson?: unknown;
    documentHtml?: string;
  };
}

export class UpdateTemplateDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) name?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(2000) description?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(80) category?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(80) industry?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(24) businessCategoryId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) thumbnailUrl?: string;
}

export class UpdateDraftSchemaDto {
  @ApiProperty({ type: Object, description: '{ schemaVersion, blocks: [...] }' })
  @IsObject()
  schemaJson!: Record<string, unknown>;
}

export class UpdateDraftFieldsDto {
  @ApiProperty({ type: Object, description: '{ schemaVersion, groups, fields, formulas }' })
  @IsObject()
  fieldSchemaJson!: Record<string, unknown>;
}

export class UpdateDraftSettingsDto {
  @ApiProperty({
    type: Object,
    description:
      'Defaults a quotation inherits: { defaultTerms, defaultPaymentTerms, defaultValidityDays, defaultTaxInclusive, defaultRoundOff, defaultPackageIds }.',
  })
  @IsObject()
  settingsJson!: Record<string, unknown>;
}

export class UpdateDraftLinesDto {
  @ApiProperty({
    type: Object,
    description: 'Default line items for quotations from this template: { lines: [...] }.',
  })
  @IsObject()
  linesJson!: Record<string, unknown>;
}

/**
 * The document-authored body.
 *
 * The cap is generous because the editor embeds inserted images as data URIs, so
 * one photograph can be a megabyte on its own. It still leaves plenty of room
 * under MongoDB's 16MB document limit. Uploading images instead of embedding them
 * is the better answer and would let this shrink considerably.
 */
export class UpdateDraftDocumentDto {
  @ApiProperty({ description: 'Sanitised on save; replaces the block body when set.' })
  @IsString()
  @MaxLength(4_000_000)
  documentHtml!: string;
}

export class UpdateDraftStyleDto {
  @ApiProperty({ type: Object })
  @IsObject()
  styleSchemaJson!: Record<string, unknown>;
}

export class PublishTemplateDto {
  @ApiPropertyOptional({ description: 'Shown in the version history.' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  changeNote?: string;
}

export class TemplateQuery extends PaginationQuery {
  @ApiPropertyOptional({ enum: ['DRAFT', 'PUBLISHED', 'ARCHIVED'] })
  @IsOptional()
  @IsIn(['DRAFT', 'PUBLISHED', 'ARCHIVED'])
  status?: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(80) industry?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(80) category?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  includeArchived = false;
}
