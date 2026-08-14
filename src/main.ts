import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module';
import { configureApp } from './app.setup';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true, bodyParser: false });
  const config = configureApp(app);
  await app.listen(config.PORT);

  const logger = new Logger('Bootstrap');
  logger.log(`API listening on ${config.API_URL}/${config.API_PREFIX}`);
  if (!config.isProduction) logger.log(`Docs at ${config.API_URL}/${config.API_PREFIX}/docs`);
}

void bootstrap();
