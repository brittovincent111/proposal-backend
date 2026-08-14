import { z } from 'zod';

/**
 * Environment is validated once at boot. A missing JWT secret must stop the
 * process, not surface later as an authentication bug in production.
 */
const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(6000),
  API_PREFIX: z.string().default('api/v1'),
  /** Passed through to Express body-parser, e.g. "10mb". */
  REQUEST_BODY_LIMIT: z.string().min(1).default('10mb'),

  MONGODB_URI: z.string().min(1),

  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 characters'),
  JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET must be at least 32 characters'),
  /** Seconds. Short by design — the refresh flow is what keeps sessions alive. */
  JWT_ACCESS_TTL_SECONDS: z.coerce.number().int().positive().default(900),
  JWT_REFRESH_TTL_DAYS: z.coerce.number().int().positive().default(30),

  APP_URL: z.string().default('http://localhost:7001'),
  API_URL: z.string().default('http://localhost:6000'),
  PUBLIC_PROPOSAL_BASE_URL: z.string().default('http://localhost:7001/p'),
  CORS_ORIGINS: z.string().default('http://localhost:7001'),

  COOKIE_DOMAIN: z.string().optional(),
  COOKIE_SECURE: z
    .enum(['true', 'false'])
    .optional()
    .transform((value) => value === 'true'),

  /**
   * Path to a Chrome/Chromium binary for PDF rendering.
   *
   * Left unset, common install locations are probed; if none is found, the PDF
   * endpoint answers PDF_RENDERER_NOT_CONFIGURED rather than failing obscurely.
   */
  CHROME_PATH: z.string().optional(),

  PUBLIC_RATE_LIMIT: z.coerce.number().int().positive().default(30),
  PUBLIC_RATE_TTL_SECONDS: z.coerce.number().int().positive().default(60),

  /**
   * Billing. Left unset, the platform still sells plans and tracks
   * subscriptions — it just cannot take money, so checkout answers
   * BILLING_NOT_CONFIGURED instead of failing obscurely. That keeps local and
   * CI environments runnable without Razorpay credentials.
   */
  RAZORPAY_KEY_ID: z.string().optional(),
  RAZORPAY_KEY_SECRET: z.string().optional(),
  /** Set in the Razorpay dashboard alongside the webhook URL; signs every delivery. */
  RAZORPAY_WEBHOOK_SECRET: z.string().optional(),
  /** Trial length for a self-serve signup when the chosen plan does not set its own. */
  BILLING_TRIAL_DAYS: z.coerce.number().int().min(0).default(14),
  /** Days a PAST_DUE tenant keeps full access before dropping to read-only. */
  BILLING_GRACE_DAYS: z.coerce.number().int().min(0).default(7),
});

export type AppConfig = ReturnType<typeof buildConfig>;

export function buildConfig(env: NodeJS.ProcessEnv = process.env) {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`);
    throw new Error(`Invalid environment configuration:\n  ${issues.join('\n  ')}`);
  }

  const value = parsed.data;
  return {
    ...value,
    isProduction: value.NODE_ENV === 'production',
    corsOrigins: value.CORS_ORIGINS.split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
    // Secure cookies are implied by production unless explicitly overridden.
    cookieSecure: value.COOKIE_SECURE ?? value.NODE_ENV === 'production',
    // Both halves of the key pair are required — an id without a secret cannot
    // sign a request, so treating it as "configured" would fail at checkout.
    billingEnabled: Boolean(value.RAZORPAY_KEY_ID && value.RAZORPAY_KEY_SECRET),
  };
}

export default buildConfig;
