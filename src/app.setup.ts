import { INestApplication, ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import { json, urlencoded } from 'express';
import helmet from 'helmet';
import type { IncomingMessage } from 'node:http';

import { APP_CONFIG } from './common/config/config.module';
import { AppConfig } from './common/config/configuration';

export interface ConfigureAppOptions {
  enableDocs?: boolean;
  enableShutdownHooks?: boolean;
}

export function configureApp(
  app: INestApplication,
  options: ConfigureAppOptions = {},
): AppConfig {
  const config = app.get<AppConfig>(APP_CONFIG);

  app.setGlobalPrefix(config.API_PREFIX);

  // Express defaults to 100kb, which is too small for document HTML that may
  // embed images as data URIs.
  //
  // `verify` keeps the exact bytes around for webhook signature checks. A
  // gateway signs what it sent; re-serialising the parsed JSON reorders keys and
  // changes whitespace, which would reject every genuine delivery.
  app.use(
    json({
      limit: config.REQUEST_BODY_LIMIT,
      verify: (request, _response, buffer) => {
        (request as IncomingMessage & { rawBody?: Buffer }).rawBody = Buffer.from(buffer);
      },
    }),
  );
  app.use(urlencoded({ extended: true, limit: config.REQUEST_BODY_LIMIT }));

  app.use(cookieParser());
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));

  // Credentials are cookies, so the origin allowlist is the boundary - a
  // wildcard here would hand every site on the internet an authenticated session.
  app.enableCors({
    origin: config.corsOrigins,
    credentials: true,
    exposedHeaders: ['Content-Disposition'],
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
    }),
  );

  // Behind a reverse proxy, request.ip must come from X-Forwarded-For or every
  // visitor hashes to the same value and rate limiting collapses.
  app.getHttpAdapter().getInstance().set('trust proxy', 1);

  if (options.enableDocs ?? !config.isProduction) {
    const swagger = new DocumentBuilder()
      .setTitle('QuoteProposal API')
      .setDescription('Proposal and quotation automation platform')
      .setVersion('1.0')
      .addCookieAuth('qtn_access')
      .addBearerAuth()
      .build();

    SwaggerModule.setup(
      `${config.API_PREFIX}/docs`,
      app,
      SwaggerModule.createDocument(app, swagger),
    );
  }

  if (options.enableShutdownHooks ?? true) app.enableShutdownHooks();

  return config;
}
