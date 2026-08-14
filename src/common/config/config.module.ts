import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { AppConfig, buildConfig } from './configuration';

export const APP_CONFIG = 'APP_CONFIG';

function resolveEnvFilePaths(nodeEnv = process.env.NODE_ENV ?? 'development'): string[] {
  const env = ['development', 'production', 'test'].includes(nodeEnv) ? nodeEnv : 'development';

  if (env === 'development') {
    return ['.env.development.local', '.env.local', '.env.development', '.env'];
  }

  if (env === 'production') {
    return ['.env.production.local', '.env.production', '.env'];
  }

  return ['.env.test', '.env'];
}

/**
 * Loads .env, validates it once, and exposes the parsed object under APP_CONFIG.
 *
 * Everything downstream injects the typed object rather than reaching into
 * process.env, so an unset variable fails at boot instead of at 3am.
 */
@Global()
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      envFilePath: resolveEnvFilePaths(),
    }),
  ],
  providers: [
    {
      provide: APP_CONFIG,
      useFactory: (): AppConfig => buildConfig(),
    },
  ],
  exports: [APP_CONFIG],
})
export class AppConfigModule {}
