import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class UpdateOrganizationDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  logoUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(60)
  timezone?: string;

  @ApiPropertyOptional({ example: 'INR' })
  @IsOptional()
  @IsString()
  @MaxLength(3)
  defaultCurrency?: string;

  @ApiPropertyOptional({ example: 'en-IN' })
  @IsOptional()
  @IsString()
  @MaxLength(10)
  locale?: string;

  @ApiPropertyOptional({ example: 'IN' })
  @IsOptional()
  @IsString()
  @MaxLength(2)
  country?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(24)
  primaryBusinessCategoryId?: string;
}

export class CompanyProfileDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) name?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(1000) address?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(60) phone?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) email?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) website?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(60) taxNumber?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(60) registrationNumber?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(2000) bankDetails?: string;
}

export class BrandingDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(32) accentColor?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) logoUrl?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) footerNote?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(10) pageSize?: string;
}

export class UpdateOrganizationSettingsDto {
  @ApiPropertyOptional({ example: 'Q' })
  @IsOptional()
  @IsString()
  @MaxLength(10)
  documentPrefix?: string;

  @ApiPropertyOptional({ example: '{PREFIX}-{YYYY}-{SEQ}' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  documentSequenceFormat?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 12 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(12)
  sequencePadding?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  resetSequenceAnnually?: boolean;

  @ApiPropertyOptional({ minimum: 1, maximum: 365 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(365)
  defaultValidityDays?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(40)
  dateFormat?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(24)
  defaultTaxRateId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  defaultTaxInclusive?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  defaultRoundOff?: boolean;

  @ApiPropertyOptional({ description: 'Blocks SEND until a manager approves — map.md §68.' })
  @IsOptional()
  @IsBoolean()
  requireApprovalBeforeSend?: boolean;

  @ApiPropertyOptional({ description: '0 means share links never expire.' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(3650)
  shareLinkValidityDays?: number;

  @ApiPropertyOptional({ type: CompanyProfileDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => CompanyProfileDto)
  company?: CompanyProfileDto;

  @ApiPropertyOptional({ type: BrandingDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => BrandingDto)
  branding?: BrandingDto;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(20000)
  defaultTerms?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(20000)
  defaultPaymentTerms?: string;
}
