import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

import { UNLIMITED } from '../plan.schema';
import { SubscriptionStatus, SubscriptionStatuses } from '../subscription.schema';

export class PlanLimitsDto {
  @ApiPropertyOptional({ description: '-1 for unlimited.' })
  @IsOptional()
  @IsInt()
  @Min(UNLIMITED)
  seats?: number;

  @ApiPropertyOptional({ description: '-1 for unlimited.' })
  @IsOptional()
  @IsInt()
  @Min(UNLIMITED)
  quotationsPerMonth?: number;

  @ApiPropertyOptional({ description: '-1 for unlimited.' })
  @IsOptional()
  @IsInt()
  @Min(UNLIMITED)
  templates?: number;

  @ApiPropertyOptional({ description: '-1 for unlimited.' })
  @IsOptional()
  @IsInt()
  @Min(UNLIMITED)
  customers?: number;

  @ApiPropertyOptional({ description: '-1 for unlimited.' })
  @IsOptional()
  @IsInt()
  @Min(UNLIMITED)
  storageMb?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  customBranding?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  removeQtnBadge?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  apiAccess?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  prioritySupport?: boolean;
}

export class PlanGatewayRefsDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  razorpayYearlyPlanId?: string;
}

export class CreatePlanDto {
  @ApiProperty({ example: 'growth' })
  @IsString()
  @Matches(/^[a-z0-9][a-z0-9-]{1,38}$/, {
    message: 'code must be lowercase letters, digits and hyphens',
  })
  code!: string;

  @ApiProperty({ example: 'Growth' })
  @IsString()
  @MaxLength(60)
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(160)
  tagline?: string;

  @ApiPropertyOptional({ example: 'INR' })
  @IsOptional()
  @IsString()
  @MaxLength(3)
  currency?: string;

  @ApiPropertyOptional({ description: 'Minor units, charged once a year.', example: 2399000 })
  @IsOptional()
  @IsInt()
  @Min(0)
  yearlyPrice?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  trialDays?: number;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(160, { each: true })
  features?: string[];

  @ApiPropertyOptional({ type: PlanLimitsDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => PlanLimitsDto)
  limits?: PlanLimitsDto;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isPublic?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isFeatured?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  sortOrder?: number;

  @ApiPropertyOptional({ type: PlanGatewayRefsDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => PlanGatewayRefsDto)
  gateway?: PlanGatewayRefsDto;
}

/** Same shape as create, minus `code` — a plan's machine key is immutable. */
export class UpdatePlanDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(60)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(160)
  tagline?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  yearlyPrice?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  trialDays?: number;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(160, { each: true })
  features?: string[];

  @ApiPropertyOptional({ type: PlanLimitsDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => PlanLimitsDto)
  limits?: PlanLimitsDto;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isPublic?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isFeatured?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  sortOrder?: number;

  @ApiPropertyOptional({ enum: ['ACTIVE', 'ARCHIVED'] })
  @IsOptional()
  @IsIn(['ACTIVE', 'ARCHIVED'])
  status?: 'ACTIVE' | 'ARCHIVED';

  @ApiPropertyOptional({ type: PlanGatewayRefsDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => PlanGatewayRefsDto)
  gateway?: PlanGatewayRefsDto;
}

export class StartCheckoutDto {
  @ApiProperty({ example: 'growth' })
  @IsString()
  @MaxLength(40)
  planCode!: string;

  /** Coupon typed by the customer. Auto-apply offers need no code. */
  @ApiPropertyOptional({ example: 'LAUNCH30' })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  discountCode?: string;
}

export class VerifyCheckoutDto {
  @ApiProperty()
  @IsString()
  @MaxLength(120)
  razorpayPaymentId!: string;

  @ApiProperty()
  @IsString()
  @MaxLength(120)
  razorpaySubscriptionId!: string;

  @ApiProperty()
  @IsString()
  @MaxLength(256)
  razorpaySignature!: string;

  /** The plan checkout was opened for; the upgrade is applied on verify. */
  @ApiPropertyOptional({ example: 'growth' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  planCode?: string;
}

export class CancelSubscriptionDto {
  @ApiPropertyOptional({
    description: 'Cancel immediately instead of at the end of the paid period.',
  })
  @IsOptional()
  @IsBoolean()
  immediately?: boolean;
}

/** Platform-admin override: move a tenant onto a plan without taking payment. */
export class AssignPlanDto {
  @ApiProperty({ example: 'business' })
  @IsString()
  @MaxLength(40)
  planCode!: string;

  @ApiPropertyOptional({ enum: SubscriptionStatuses })
  @IsOptional()
  @IsIn(SubscriptionStatuses)
  status?: SubscriptionStatus;

  @ApiPropertyOptional({ description: 'Days to extend the current period by.' })
  @IsOptional()
  @IsInt()
  @Min(0)
  periodDays?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
