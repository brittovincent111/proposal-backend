import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'owner@abctravels.in' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'correct-horse-battery' })
  @IsString()
  @MinLength(8)
  @MaxLength(200)
  password!: string;
}

export class RegisterDto {
  @ApiProperty({ example: 'owner@abctravels.in' })
  @IsEmail() 
  email!: string;

  @ApiProperty({ minLength: 10, description: 'Minimum 10 characters.' })
  @IsString()
  @MinLength(10)
  @MaxLength(200)
  password!: string;

  @ApiProperty({ example: 'ABC Travels', description: 'Creates the organization this user owns.' })
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  organizationName!: string;

  @ApiPropertyOptional({ description: 'Primary business category for the new organization.' })
  @IsOptional()
  @IsString()
  @MaxLength(24)
  primaryBusinessCategoryId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(80)
  firstName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(80)
  lastName?: string;
}

export class ForgotPasswordDto {
  @ApiProperty({ example: 'owner@abctravels.in' })
  @IsEmail()
  email!: string;
}

export class ResetPasswordDto {
  @ApiProperty({ description: 'The token from the reset link.' })
  @IsString()
  @MinLength(20)
  @MaxLength(200)
  token!: string;

  @ApiProperty({ minLength: 10, description: 'Minimum 10 characters.' })
  @IsString()
  @MinLength(10)
  @MaxLength(200)
  password!: string;
}

export class AcceptInviteDto {
  @ApiProperty({ description: 'The token from the invite link.' })
  @IsString()
  @MinLength(20)
  @MaxLength(200)
  token!: string;

  @ApiProperty({ minLength: 10, description: 'Minimum 10 characters.' })
  @IsString()
  @MinLength(10)
  @MaxLength(200)
  password!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(80)
  firstName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(80)
  lastName?: string;
}
