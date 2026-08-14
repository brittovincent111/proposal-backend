import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { CredentialToken, CredentialTokenSchema } from './credential-token.schema';
import { CredentialsService } from './credentials.service';

/**
 * Kept separate from AuthModule so MembersModule can mint invite links without
 * the two modules importing each other.
 */
@Module({
  imports: [
    MongooseModule.forFeature([{ name: CredentialToken.name, schema: CredentialTokenSchema }]),
  ],
  providers: [CredentialsService],
  exports: [CredentialsService],
})
export class CredentialsModule {}
