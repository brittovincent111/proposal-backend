import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { MongooseModule } from '@nestjs/mongoose';
import { PassportModule } from '@nestjs/passport';

import { BusinessCategoriesModule } from 'src/business-categories/business-categories.module';
import { MembersModule } from 'src/members/members.module';
import { NotificationsModule } from 'src/notifications/notifications.module';
import { OrganizationsModule } from 'src/organizations/organizations.module';
import { TemplatesModule } from 'src/templates/templates.module';
import { UsersModule } from 'src/users/users.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './jwt.strategy';
import { CredentialsModule } from './credentials.module';
import { RefreshToken, RefreshTokenSchema } from './refresh-token.schema';
import { TokenService } from './token.service';

@Module({
  imports: [
    PassportModule,
    JwtModule.register({}),
    MongooseModule.forFeature([{ name: RefreshToken.name, schema: RefreshTokenSchema }]),
    UsersModule,
    BusinessCategoriesModule,
    OrganizationsModule,
    MembersModule,
    TemplatesModule,
    NotificationsModule,
    CredentialsModule,
  ],
  controllers: [AuthController],
  providers: [AuthService, TokenService, JwtStrategy],
  exports: [AuthService, TokenService],
})
export class AuthModule {}
