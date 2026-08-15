import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module';
import { configureApp } from './app.setup';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true, bodyParser: false });
  const config = configureApp(app);

  // Buffered logs are discarded if the process dies before they are written, so
  // a failure to bind the port exits silently with an empty terminal — which
  // reads as "nothing happened" rather than "the port is taken". Flush first.
  app.flushLogs();

  try {
    await app.listen(config.PORT);
  } catch (error) {
    const reason = (error as NodeJS.ErrnoException).code === 'EADDRINUSE'
      ? `Port ${config.PORT} is already in use — another instance is probably still running.`
      : (error as Error).message;
    new Logger('Bootstrap').error(`Could not start the API. ${reason}`);
    process.exit(1);
  }

  const logger = new Logger('Bootstrap');
  logger.log(`API listening on ${config.API_URL}/${config.API_PREFIX}`);
  if (!config.isProduction) logger.log(`Docs at ${config.API_URL}/${config.API_PREFIX}/docs`);
}

void bootstrap();
