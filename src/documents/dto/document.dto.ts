import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsMongoId,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

import { PaginationQuery } from 'src/common/dto/pagination.dto';
import { DocumentStatuses } from '../schemas/document.schema';

export class CreateDocumentDto {
  @ApiPropertyOptional({ description: 'Pins the template\'s active published version.' })
  @IsOptional()
  @IsMongoId()
  templateId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsMongoId()
  customerId?: string;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(300) title?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(120) reference?: string;

  @ApiPropertyOptional({ description: 'ISO date; defaults to today + organization validity.' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  validUntil?: string;

  @ApiPropertyOptional({ type: Object, description: 'Initial answers to the template questions.' })
  @IsOptional()
  @IsObject()
  answers?: Record<string, unknown>;
}

export class UpdateDocumentDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(300) title?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(120) reference?: string;

  @ApiPropertyOptional({ description: 'Pins a published template on an editable draft.' })
  @IsOptional()
  @IsMongoId()
  templateId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsMongoId()
  customerId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsMongoId()
  assignedToId?: string;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(40) validUntil?: string;

  @ApiPropertyOptional({ type: Object })
  @IsOptional()
  @IsObject()
  answers?: Record<string, unknown>;

  @ApiPropertyOptional({ type: [Object], description: 'Pricing sections with their lines.' })
  @IsOptional()
  @IsArray()
  sections?: unknown[];

  @ApiPropertyOptional({ type: Object, description: '{ mode: PERCENT|AMOUNT, value }' })
  @IsOptional()
  @IsObject()
  overallDiscount?: Record<string, unknown>;

  @ApiPropertyOptional({ type: [Object] })
  @IsOptional()
  @IsArray()
  charges?: unknown[];

  @ApiPropertyOptional() @IsOptional() @IsBoolean() taxInclusive?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() roundOff?: boolean;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(20000) customerNotes?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(20000) terms?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(20000) paymentTerms?: string;

  @ApiPropertyOptional({ description: 'Never leaves the organization.' })
  @IsOptional()
  @IsString()
  @MaxLength(20000)
  internalNotes?: string;

  @ApiPropertyOptional({
    description: 'Document version the edit was based on. Rejects stale writes — map.md §40.',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  expectedVersion?: number;
}

export class AddPackageDto {
  @ApiProperty()
  @IsMongoId()
  packageId!: string;

  @ApiPropertyOptional({ description: 'Section to append to; defaults to the first section.' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  sectionId?: string;
}

export class CreateRevisionDto {
  @ApiPropertyOptional({ description: 'Why this revision exists; shown in the timeline.' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class SendDocumentDto {
  @ApiPropertyOptional({ description: 'Days until the share link expires. 0 uses the org default.' })
  @IsOptional()
  @IsInt()
  @Min(0)
  shareValidityDays?: number;
}

export class DocumentQuery extends PaginationQuery {
  @ApiPropertyOptional({ enum: DocumentStatuses })
  @IsOptional()
  @IsIn(DocumentStatuses)
  status?: (typeof DocumentStatuses)[number];

  @ApiPropertyOptional()
  @IsOptional()
  @IsMongoId()
  customerId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsMongoId()
  templateId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsMongoId()
  assignedToId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  includeArchived = false;
}

export class SectionDto {
  @ApiProperty() @IsString() @MaxLength(64) id!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) title?: string;

  @ApiPropertyOptional({ type: [Object] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => Object)
  lines?: unknown[];
}
