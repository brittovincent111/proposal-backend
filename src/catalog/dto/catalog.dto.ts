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

export class CreateItemDto {
  @ApiProperty({ example: 'Innova Crysta (per day)' })
  @IsString()
  @MaxLength(200)
  name!: string;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(2000) description?: string;

  @ApiPropertyOptional({ enum: ['PRODUCT', 'SERVICE'] })
  @IsOptional()
  @IsIn(['PRODUCT', 'SERVICE'])
  type?: 'PRODUCT' | 'SERVICE';

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(80) category?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(20) unit?: string;

  @ApiPropertyOptional({ description: 'Minor units (paise). 450000 = ₹4,500.00' })
  @IsOptional()
  @IsInt()
  @Min(0)
  defaultRate?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsMongoId()
  taxRateId?: string | null;
}

export class UpdateItemDto extends PartialType(CreateItemDto) {}

export class ItemQuery extends PaginationQuery {
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  includeArchived = false;

  @ApiPropertyOptional({ enum: ['PRODUCT', 'SERVICE'] })
  @IsOptional()
  @IsIn(['PRODUCT', 'SERVICE'])
  type?: 'PRODUCT' | 'SERVICE';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(80)
  category?: string;
}

export class TaxComponentDto {
  @ApiProperty() @IsString() @MaxLength(40) name!: string;

  @ApiProperty()
  @IsNumber()
  @Min(0)
  @Max(100)
  percent!: number;
}

export class CreateTaxRateDto {
  @ApiProperty({ example: 'GST 18%' })
  @IsString()
  @MaxLength(80)
  name!: string;

  @ApiProperty({ example: 18 })
  @IsNumber()
  @Min(0)
  @Max(100)
  percent!: number;

  @ApiPropertyOptional({
    type: [TaxComponentDto],
    description: 'Split components (CGST/SGST). Leave empty for a single tax line.',
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TaxComponentDto)
  components?: TaxComponentDto[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}

export class UpdateTaxRateDto extends PartialType(CreateTaxRateDto) {}
