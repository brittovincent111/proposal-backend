import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { getModelToken } from '@nestjs/mongoose';
import { Model } from 'mongoose';

import { AppModule } from 'src/app.module';
import { User, UserDocument } from 'src/users/user.schema';

/**
 * Grants or revokes platform-admin access.
 *
 *   npm run admin:grant -- someone@example.com
 *   npm run admin:grant -- someone@example.com --revoke
 *
 * Intentionally the only way to set this flag. Exposing it over HTTP would mean
 * a single compromised owner account could escalate to the whole platform.
 */
async function main(): Promise<void> {
  const logger = new Logger('PlatformAdmin');
  const [email, ...flags] = process.argv.slice(2);
  const revoke = flags.includes('--revoke');

  if (!email) {
    logger.error('Usage: npm run admin:grant -- <email> [--revoke]');
    process.exitCode = 1;
    return;
  }

  const app = await NestFactory.createApplicationContext(AppModule, { bufferLogs: false });

  try {
    const users = app.get<Model<UserDocument>>(getModelToken(User.name));
    const result = await users.findOneAndUpdate(
      { email: email.toLowerCase().trim() },
      { $set: { isPlatformAdmin: !revoke } },
      { new: true },
    );

    if (!result) {
      logger.error(`No user found with the email ${email}. They must sign up first.`);
      process.exitCode = 1;
      return;
    }

    logger.log(
      revoke
        ? `Revoked platform-admin access for ${result.email}.`
        : `${result.email} is now a platform administrator.`,
    );
  } finally {
    await app.close();
  }
}

void main();
