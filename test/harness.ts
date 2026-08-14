import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getConnectionToken } from '@nestjs/mongoose';
import { Connection } from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import request from 'supertest';

import { AppModule } from 'src/app.module';
import { configureApp } from 'src/app.setup';
import { AppConfig } from 'src/common/config/configuration';

/**
 * Boots the real application against an in-memory MongoDB.
 *
 * Guards, pipes and the exception filter are all live: an e2e test that stubbed
 * them out would prove nothing about tenant isolation, which is the main thing
 * these tests exist to check.
 */
export interface Harness {
  app: INestApplication;
  connection: Connection;
  config: AppConfig;
  close: () => Promise<void>;
}

let server: MongoMemoryReplSet | null = null;

export interface StartHarnessOptions {
  env?: Partial<NodeJS.ProcessEnv>;
}

export async function startHarness(options: StartHarnessOptions = {}): Promise<Harness> {
  // A replica set (of one) so the same URI works whether or not a test needs
  // transactions later.
  server = await MongoMemoryReplSet.create({ replSet: { count: 1 } });

  const previousEnv = applyEnv({
    NODE_ENV: 'test',
    MONGODB_URI: server.getUri('qtn-test'),
    JWT_ACCESS_SECRET: 'test-access-secret-that-is-long-enough-32',
    JWT_REFRESH_SECRET: 'test-refresh-secret-that-is-long-enough-32',
    COOKIE_SECURE: 'false',
    REQUEST_BODY_LIMIT: undefined,
    ...options.env,
  });

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication({ bodyParser: false });

  const config = configureApp(app, { enableDocs: false, enableShutdownHooks: false });
  await app.init();

  const connection = app.get<Connection>(getConnectionToken());

  return {
    app,
    connection,
    config,
    close: async () => {
      await app.close();
      await server?.stop();
      server = null;
      restoreEnv(previousEnv);
    },
  };
}

export interface Session {
  organizationId: string;
  userId: string;
  cookies: string[];
  csrf: string;
}

/** Signs a new owner up and returns everything needed to make authenticated calls. */
export async function registerOrganization(
  harness: Harness,
  input: { email: string; organizationName: string; password?: string },
): Promise<Session> {
  const response = await api(harness)
    .post('/auth/register')
    .send({
      email: input.email,
      password: input.password ?? 'harness-password-123',
      organizationName: input.organizationName,
    })
    .expect(201);

  const cookies = collectCookies(response);
  return {
    organizationId: response.body.organizations[0].id,
    userId: response.body.user.id,
    cookies,
    csrf: readCookie(cookies, 'qtn_csrf'),
  };
}

export function api(harness: Harness) {
  const agent = request(harness.app.getHttpServer());
  const prefix = `/${harness.config.API_PREFIX}`;

  const wrap = (method: 'get' | 'post' | 'patch' | 'delete') => (path: string) =>
    agent[method](`${prefix}${path}`);

  return { get: wrap('get'), post: wrap('post'), patch: wrap('patch'), delete: wrap('delete') };
}

/** Attaches the session cookies, the CSRF header and the tenant header. */
export function as(session: Session) {
  return (req: request.Test): request.Test =>
    req
      .set('Cookie', session.cookies)
      .set('x-csrf-token', session.csrf)
      .set('x-organization-id', session.organizationId);
}

function collectCookies(response: request.Response): string[] {
  const raw = response.headers['set-cookie'];
  if (!raw) return [];
  return (Array.isArray(raw) ? raw : [raw]).map((cookie) => cookie.split(';')[0]);
}

function readCookie(cookies: string[], name: string): string {
  const match = cookies.find((cookie) => cookie.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : '';
}

function applyEnv(next: Partial<NodeJS.ProcessEnv>): Map<string, string | undefined> {
  const previous = new Map<string, string | undefined>();

  for (const [key, value] of Object.entries(next)) {
    previous.set(key, process.env[key]);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }

  return previous;
}

function restoreEnv(previous: Map<string, string | undefined>): void {
  for (const [key, value] of previous) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}
