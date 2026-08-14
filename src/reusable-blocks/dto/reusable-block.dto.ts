import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsArray, IsBoolean, IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

import { PaginationQuery } from 'src/common/dto/pagination.dto';

export class CreateReusableBlockDto {
  @ApiProperty({ example: 'Standard cancellation policy' })
  @IsString()
  @MaxLength(200)
  name!: string;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(2000) description?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(80) category?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @ApiProperty({
    description: 'Template blocks in the same shape a template stores them: { blocks: [...] }.',
    type: Object,
  })
  @IsObject()
  blockJson!: Record<string, unknown>;
}

export class UpdateReusableBlockDto extends PartialType(CreateReusableBlockDto) {}

export class ReusableBlockQuery extends PaginationQuery {
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  includeArchived = false;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(80) category?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(80) tag?: string;
}
