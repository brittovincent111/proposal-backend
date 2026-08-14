import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsMongoId,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';

import {
  DiscountDuration,
  DiscountDurations,
  DiscountEligibilities,
  DiscountEligibility,
  DiscountType,
  DiscountTypes,
} from '../discount.schema';

export class CreateDiscountDto {
  @ApiProperty({ example: 'Founding Customer Offer' })
  @IsString()
  @MaxLength(120)
  name!: string;

  @ApiProperty({ example: 'FOUNDER50' })
  @IsString()
  @Matches(/^[A-Za-z0-9][A-Za-z0-9_-]{2,31}$/, {
    message: 'code must be 3–32 letters, digits, hyphens or underscores',
  })
  code!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  autoApply?: boolean;

  @ApiPropertyOptional({ description: 'List this offer on the public pricing page.' })
  @IsOptional()
  @IsBoolean()
  advertise?: boolean;

  @ApiPropertyOptional({ type: [String], description: 'Empty means every plan.' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  planCodes?: string[];

  @ApiProperty({ enum: DiscountTypes })
  @IsIn(DiscountTypes)
  type!: DiscountType;

  @ApiProperty({ description: 'Percent for PERCENT; minor units for AMOUNT and OVERRIDE.' })
  @IsInt()
  @Min(0)
  value!: number;

  @ApiPropertyOptional({ enum: DiscountDurations })
  @IsOptional()
  @IsIn(DiscountDurations)
  duration?: DiscountDuration;

  @ApiPropertyOptional({ enum: DiscountEligibilities })
  @IsOptional()
  @IsIn(DiscountEligibilities)
  eligibility?: DiscountEligibility;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsMongoId({ each: true })
  organizationIds?: string[];

  @ApiPropertyOptional({ description: '0 means unlimited.' })
  @IsOptional()
  @IsInt()
  @Min(0)
  maxRedemptions?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  startsAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  endsAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  stackable?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  internalNote?: string;

  @ApiPropertyOptional({ enum: ['ACTIVE', 'INACTIVE'] })
  @IsOptional()
  @IsIn(['ACTIVE', 'INACTIVE'])
  status?: 'ACTIVE' | 'INACTIVE';
}

/** Same shape minus `code`, which is immutable once links carrying it are out. */
export class UpdateDiscountDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  autoApply?: boolean;

  @ApiPropertyOptional({ description: 'List this offer on the public pricing page.' })
  @IsOptional()
  @IsBoolean()
  advertise?: boolean;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  planCodes?: string[];

  @ApiPropertyOptional({ enum: DiscountTypes })
  @IsOptional()
  @IsIn(DiscountTypes)
  type?: DiscountType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  value?: number;

  @ApiPropertyOptional({ enum: DiscountDurations })
  @IsOptional()
  @IsIn(DiscountDurations)
  duration?: DiscountDuration;

  @ApiPropertyOptional({ enum: DiscountEligibilities })
  @IsOptional()
  @IsIn(DiscountEligibilities)
  eligibility?: DiscountEligibility;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsMongoId({ each: true })
  organizationIds?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  maxRedemptions?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  startsAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  endsAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  stackable?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  internalNote?: string;

  @ApiPropertyOptional({ enum: ['ACTIVE', 'INACTIVE'] })
  @IsOptional()
  @IsIn(['ACTIVE', 'INACTIVE'])
  status?: 'ACTIVE' | 'INACTIVE';
}

/** "What would I pay for this plan, with this code?" — before committing. */
export class PreviewPriceDto {
  @ApiProperty({ example: 'growth' })
  @IsString()
  @MaxLength(40)
  planCode!: string;

  @ApiPropertyOptional({ example: 'LAUNCH30' })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  code?: string;
}
