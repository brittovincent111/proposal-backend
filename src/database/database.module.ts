import { Global, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { APP_CONFIG } from 'src/common/config/config.module';
import { AppConfig } from 'src/common/config/configuration';

@Global()
@Module({
  imports: [
    MongooseModule.forRootAsync({
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) => ({
        uri: config.MONGODB_URI,
        // Indexes are declared on the schemas; building them at boot keeps the
        // unique constraints that guard numbering and tenancy real in every
        // environment, not just wherever someone remembered to run a script.
        autoIndex: true,
        serverSelectionTimeoutMS: 5000,
      }),
    }),
  ],
})
export class DatabaseModule {}
