import { ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';

import { PaginationQuery } from 'src/common/dto/pagination.dto';

export class AddressDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) line1?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) line2?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100) city?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100) state?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(20) postalCode?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100) country?: string;
}

export class CreateCustomerDto {
  @ApiPropertyOptional({ enum: ['INDIVIDUAL', 'BUSINESS'] })
  @IsOptional()
  @IsIn(['INDIVIDUAL', 'BUSINESS'])
  type?: 'INDIVIDUAL' | 'BUSINESS';

  @ApiPropertyOptional({ example: 'Ravi Menon' })
  @IsString()
  @MaxLength(200)
  name!: string;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) companyName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  @MaxLength(200)
  email?: string;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(40) phone?: string;

  /** Optional by design — map.md §7 explicitly refuses to require tax identifiers. */
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(40) taxId?: string;

  @ApiPropertyOptional({ type: AddressDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => AddressDto)
  billingAddress?: AddressDto;

  @ApiPropertyOptional({ type: AddressDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => AddressDto)
  shippingAddress?: AddressDto;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(5000) notes?: string;

  @ApiPropertyOptional({ type: Object })
  @IsOptional()
  @IsObject()
  customFields?: Record<string, unknown>;
}

export class UpdateCustomerDto extends PartialType(CreateCustomerDto) {}

export class CustomerQuery extends PaginationQuery {
  @ApiPropertyOptional({ description: 'Include archived customers.' })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  includeArchived = false;

  @ApiPropertyOptional({ enum: ['INDIVIDUAL', 'BUSINESS'] })
  @IsOptional()
  @IsIn(['INDIVIDUAL', 'BUSINESS'])
  type?: 'INDIVIDUAL' | 'BUSINESS';
}
