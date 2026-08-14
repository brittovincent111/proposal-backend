import { Inject, Injectable, Logger } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'node:crypto';

import { APP_CONFIG } from 'src/common/config/config.module';
import { AppConfig } from 'src/common/config/configuration';
import { DomainException } from 'src/common/errors/domain.exception';
import { ErrorCodes } from 'src/common/errors/error-codes';

const RAZORPAY_API = 'https://api.razorpay.com/v1';

/** Razorpay bills a subscription `total_count` times, then stops. Ten yearly
 *  cycles stands in for "until cancelled", which their API has no flag for. */
const YEARLY_CYCLES = 10;

export interface GatewayCustomer {
  id: string;
}

export interface GatewaySubscription {
  id: string;
  status: string;
  shortUrl: string | null;
  /** Unix seconds, or null while the subscription is still `created`. */
  currentStart: number | null;
  currentEnd: number | null;
}

interface RazorpaySubscriptionBody {
  id: string;
  status: string;
  short_url?: string | null;
  current_start?: number | null;
  current_end?: number | null;
}

/**
 * Thin REST client for the pieces of Razorpay this platform uses.
 *
 * Written against `fetch` rather than the `razorpay` npm package on purpose:
 * the surface here is four endpoints and two HMACs, and the SDK ships its own
 * request stack with no type coverage of the responses we care about.
 */
@Injectable()
export class RazorpayGateway {
  private readonly logger = new Logger(RazorpayGateway.name);

  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  get isConfigured(): boolean {
    return this.config.billingEnabled;
  }

  /** The publishable half of the key pair — safe to hand to the browser. */
  get publicKeyId(): string | null {
    return this.config.RAZORPAY_KEY_ID ?? null;
  }

  private assertConfigured(): { keyId: string; keySecret: string } {
    const keyId = this.config.RAZORPAY_KEY_ID;
    const keySecret = this.config.RAZORPAY_KEY_SECRET;
    if (!keyId || !keySecret) {
      throw new DomainException(
        ErrorCodes.BILLING_NOT_CONFIGURED,
        'Online payments are not configured on this deployment.',
        503,
      );
    }
    return { keyId, keySecret };
  }

  private async request<T>(path: string, init: { method: string; body?: unknown }): Promise<T> {
    const { keyId, keySecret } = this.assertConfigured();
    const auth = Buffer.from(`${keyId}:${keySecret}`).toString('base64');

    let response: Response;
    try {
      response = await fetch(`${RAZORPAY_API}${path}`, {
        method: init.method,
        headers: {
          Authorization: `Basic ${auth}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: init.body === undefined ? undefined : JSON.stringify(init.body),
      });
    } catch (error) {
      // A network failure must not surface as a 500 with a stack trace — the
      // caller is a checkout button and needs something it can retry.
      this.logger.error(`Razorpay ${init.method} ${path} unreachable`, error as Error);
      throw new DomainException(
        ErrorCodes.GATEWAY_REQUEST_FAILED,
        'Could not reach the payment provider. Please try again.',
        502,
      );
    }

    const payload: unknown = await response.json().catch(() => null);

    if (!response.ok) {
      const description = readGatewayError(payload);
      this.logger.error(`Razorpay ${init.method} ${path} → ${response.status}: ${description}`);
      throw new DomainException(
        ErrorCodes.GATEWAY_REQUEST_FAILED,
        description || 'The payment provider rejected the request.',
        502,
      );
    }

    return payload as T;
  }

  async createCustomer(input: {
    name: string;
    email: string;
    contact?: string;
  }): Promise<GatewayCustomer> {
    // `fail_existing: 0` makes this idempotent by email — Razorpay returns the
    // existing customer instead of erroring, so a retried checkout is harmless.
    const body = await this.request<{ id: string }>('/customers', {
      method: 'POST',
      body: {
        name: input.name,
        email: input.email,
        contact: input.contact,
        fail_existing: 0,
      },
    });
    return { id: body.id };
  }

  async createSubscription(input: {
    gatewayPlanId: string;
    customerId?: string | null;
    /** Unix seconds. Razorpay charges the first cycle here, so a trial is
     *  expressed as a start date in the future rather than a trial flag. */
    startAt?: number | null;
    notes?: Record<string, string>;
  }): Promise<GatewaySubscription> {
    const body = await this.request<RazorpaySubscriptionBody>('/subscriptions', {
      method: 'POST',
      body: {
        plan_id: input.gatewayPlanId,
        total_count: YEARLY_CYCLES,
        quantity: 1,
        customer_notify: 1,
        customer_id: input.customerId ?? undefined,
        start_at: input.startAt ?? undefined,
        notes: input.notes ?? {},
      },
    });
    return toGatewaySubscription(body);
  }

  async fetchSubscription(subscriptionId: string): Promise<GatewaySubscription> {
    const body = await this.request<RazorpaySubscriptionBody>(
      `/subscriptions/${encodeURIComponent(subscriptionId)}`,
      { method: 'GET' },
    );
    return toGatewaySubscription(body);
  }

  async cancelSubscription(
    subscriptionId: string,
    options: { atCycleEnd: boolean },
  ): Promise<GatewaySubscription> {
    const body = await this.request<RazorpaySubscriptionBody>(
      `/subscriptions/${encodeURIComponent(subscriptionId)}/cancel`,
      { method: 'POST', body: { cancel_at_cycle_end: options.atCycleEnd ? 1 : 0 } },
    );
    return toGatewaySubscription(body);
  }

  /**
   * Verifies the handshake Checkout.js hands back to the browser.
   *
   * Without this, anyone could POST a made-up subscription id and be marked
   * paid. For subscriptions Razorpay signs `payment_id|subscription_id` — note
   * the order is the reverse of the one-time-order flow.
   */
  verifyCheckoutSignature(input: {
    paymentId: string;
    subscriptionId: string;
    signature: string;
  }): void {
    const { keySecret } = this.assertConfigured();
    const expected = createHmac('sha256', keySecret)
      .update(`${input.paymentId}|${input.subscriptionId}`)
      .digest('hex');

    if (!safeEqualHex(expected, input.signature)) {
      throw DomainException.forbidden(
        'Payment could not be verified.',
        ErrorCodes.CHECKOUT_SIGNATURE_INVALID,
      );
    }
  }

  /**
   * Verifies a webhook delivery against the exact bytes received.
   *
   * Must be given the raw body: re-serialising the parsed JSON reorders keys
   * and changes whitespace, which changes the digest and rejects every genuine
   * delivery.
   */
  verifyWebhookSignature(rawBody: Buffer | string, signature: string | undefined): void {
    const secret = this.config.RAZORPAY_WEBHOOK_SECRET;
    if (!secret) {
      throw new DomainException(
        ErrorCodes.BILLING_NOT_CONFIGURED,
        'Webhooks are not configured on this deployment.',
        503,
      );
    }
    if (!signature) {
      throw DomainException.forbidden(
        'Missing webhook signature.',
        ErrorCodes.WEBHOOK_SIGNATURE_INVALID,
      );
    }

    const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
    if (!safeEqualHex(expected, signature)) {
      throw DomainException.forbidden(
        'Webhook signature did not match.',
        ErrorCodes.WEBHOOK_SIGNATURE_INVALID,
      );
    }
  }
}

function toGatewaySubscription(body: RazorpaySubscriptionBody): GatewaySubscription {
  return {
    id: body.id,
    status: body.status,
    shortUrl: body.short_url ?? null,
    currentStart: body.current_start ?? null,
    currentEnd: body.current_end ?? null,
  };
}

function readGatewayError(payload: unknown): string {
  if (!payload || typeof payload !== 'object') return '';
  const error = (payload as { error?: { description?: unknown } }).error;
  const description = error?.description;
  return typeof description === 'string' ? description : '';
}

/** Constant-time compare that tolerates a wrong-length attacker-supplied value. */
function safeEqualHex(expected: string, actual: string): boolean {
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(actual, 'utf8');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
