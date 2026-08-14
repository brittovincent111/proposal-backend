import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsMongoId,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

import { PaginationQuery } from 'src/common/dto/pagination.dto';

export class PackageLineDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(64) lineId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsMongoId()
  itemId?: string | null;

  @ApiProperty() @IsString() @MaxLength(200) name!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(2000) description?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(20) unit?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  quantity?: number;

  @ApiPropertyOptional({ description: 'Minor units.' })
  @IsOptional()
  @IsInt()
  @Min(0)
  rate?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsMongoId()
  taxRateId?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  optional?: boolean;
}

export class CreatePackageDto {
  @ApiProperty({ example: 'Munnar 3N/4D — Deluxe' })
  @IsString()
  @MaxLength(200)
  name!: string;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(2000) description?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(80) category?: string;

  @ApiPropertyOptional({ type: [PackageLineDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PackageLineDto)
  lines?: PackageLineDto[];

  @ApiPropertyOptional({ enum: ['SUM_OF_ITEMS', 'FIXED_PRICE', 'DISCOUNTED_TOTAL'] })
  @IsOptional()
  @IsIn(['SUM_OF_ITEMS', 'FIXED_PRICE', 'DISCOUNTED_TOTAL'])
  pricingMode?: 'SUM_OF_ITEMS' | 'FIXED_PRICE' | 'DISCOUNTED_TOTAL';

  @ApiPropertyOptional({ description: 'Minor units; used when pricingMode is FIXED_PRICE.' })
  @IsOptional()
  @IsInt()
  @Min(0)
  fixedPrice?: number;

  @ApiPropertyOptional({ description: 'Used when pricingMode is DISCOUNTED_TOTAL.' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  discountPercent?: number;
}

export class UpdatePackageDto extends PartialType(CreatePackageDto) {}

export class PackageQuery extends PaginationQuery {
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  includeArchived = false;

  @ApiPropertyOptional({ enum: ['DRAFT', 'PUBLISHED', 'ARCHIVED'] })
  @IsOptional()
  @IsIn(['DRAFT', 'PUBLISHED', 'ARCHIVED'])
  status?: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(80)
  category?: string;
}
