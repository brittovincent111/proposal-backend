import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { CredentialsModule } from 'src/auth/credentials.module';
import { NotificationsModule } from 'src/notifications/notifications.module';
import { UsersModule } from 'src/users/users.module';
import { MembersController } from './members.controller';
import { MembersService } from './members.service';
import { OrganizationMember, OrganizationMemberSchema } from './organization-member.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: OrganizationMember.name, schema: OrganizationMemberSchema },
    ]),
    UsersModule,
    CredentialsModule,
    NotificationsModule,
  ],
  controllers: [MembersController],
  providers: [MembersService],
  exports: [MembersService, MongooseModule],
})
export class MembersModule {}
