import { Body, Controller, Headers, HttpCode, Logger, Post, Req } from '@nestjs/common';
import { ApiExcludeEndpoint } from '@nestjs/swagger';
import { InjectModel } from '@nestjs/mongoose';
import { Request } from 'express';
import { Model } from 'mongoose';

import { Public } from 'src/common/decorators';
import { DomainException } from 'src/common/errors/domain.exception';
import { ErrorCodes } from 'src/common/errors/error-codes';
import { RazorpayGateway } from './razorpay.gateway';
import { SubscriptionsService } from './subscriptions.service';
import { WebhookEvent, WebhookEventDocument } from './webhook-event.schema';

interface RazorpayEventBody {
  event?: string;
  payload?: {
    subscription?: {
      entity?: {
        id?: string;
        status?: string;
        current_start?: number | null;
        current_end?: number | null;
        notes?: Record<string, string>;
      };
    };
    payment?: { entity?: { id?: string; amount?: number; currency?: string } };
  };
}

@Controller('billing/webhooks')
export class BillingWebhookController {
  private readonly logger = new Logger(BillingWebhookController.name);

  constructor(
    private readonly razorpay: RazorpayGateway,
    private readonly subscriptions: SubscriptionsService,
    @InjectModel(WebhookEvent.name)
    private readonly events: Model<WebhookEventDocument>,
  ) {}

  /**
   * Razorpay subscription events.
   *
   * Public because the caller is Razorpay, not a signed-in user — the HMAC over
   * the raw body is the authentication. Always answers 200 once the signature
   * checks out: a 500 makes Razorpay retry the same delivery for hours, and a
   * bug in our handling should not turn into a redelivery storm.
   */
  @Post('razorpay')
  @Public()
  @HttpCode(200)
  @ApiExcludeEndpoint()
  async razorpayEvent(
    @Req() request: Request & { rawBody?: Buffer },
    @Headers('x-razorpay-signature') signature: string | undefined,
    @Headers('x-razorpay-event-id') eventId: string | undefined,
    @Body() body: RazorpayEventBody,
  ) {
    const raw = request.rawBody;
    if (!raw) {
      // Re-serialising the parsed body would reorder keys and break the digest,
      // so a missing raw body is a misconfiguration, not something to work around.
      this.logger.error('Webhook raw body missing — check the json() verify hook in app.setup');
      throw new DomainException(
        ErrorCodes.WEBHOOK_SIGNATURE_INVALID,
        'Webhook body could not be verified.',
        400,
      );
    }

    this.razorpay.verifyWebhookSignature(raw, signature);

    if (eventId && !(await this.claimEvent(eventId, body.event ?? 'unknown'))) {
      return { received: true, duplicate: true };
    }

    try {
      await this.handle(body);
    } catch (error) {
      this.logger.error(`Failed handling Razorpay event ${body.event}`, error as Error);
      // Swallowed on purpose — see the note above about redelivery storms.
    }

    return { received: true };
  }

  /**
   * Records the delivery id, returning false if we have seen it before.
   *
   * The unique index is the actual guard: two concurrent redeliveries both
   * reach the `exists` check, and only one of them wins the insert.
   */
  private async claimEvent(eventId: string, eventType: string): Promise<boolean> {
    try {
      await this.events.create({ eventId, provider: 'RAZORPAY', eventType });
      return true;
    } catch (error) {
      if ((error as { code?: number }).code === 11000) return false;
      throw error;
    }
  }

  private async handle(body: RazorpayEventBody): Promise<void> {
    const event = body.event ?? '';
    const entity = body.payload?.subscription?.entity;
    const gatewaySubscriptionId = entity?.id;

    if (!gatewaySubscriptionId) {
      this.logger.warn(`Razorpay event ${event} carried no subscription entity; ignoring`);
      return;
    }

    const subscription = await this.subscriptions.findByGatewayId(gatewaySubscriptionId);
    if (!subscription) {
      // A subscription created outside this deployment (or against a different
      // database) is not ours to act on.
      this.logger.warn(`No local subscription for ${gatewaySubscriptionId}; ignoring ${event}`);
      return;
    }

    switch (event) {
      case 'subscription.activated':
      case 'subscription.charged':
      case 'subscription.updated':
      case 'subscription.resumed': {
        // The plan the tenant chose travels in the notes we set at checkout, so
        // the first successful charge is what performs the upgrade.
        await this.subscriptions.adoptPlanFromNotes(subscription, entity.notes?.planCode);
        await this.subscriptions.applyGatewayState(
          subscription,
          {
            id: gatewaySubscriptionId,
            status: entity.status ?? 'active',
            currentStart: entity.current_start ?? null,
            currentEnd: entity.current_end ?? null,
          },
          body.payload?.payment?.entity?.id ?? null,
        );
        return;
      }

      case 'subscription.pending':
      case 'subscription.halted':
        await this.subscriptions.markPastDue(subscription);
        return;

      case 'subscription.cancelled':
      case 'subscription.completed':
      case 'subscription.expired':
        await this.subscriptions.applyGatewayState(subscription, {
          id: gatewaySubscriptionId,
          status: entity.status ?? 'cancelled',
          currentStart: entity.current_start ?? null,
          currentEnd: entity.current_end ?? null,
        });
        return;

      default:
        this.logger.debug(`Ignoring unhandled Razorpay event ${event}`);
    }
  }
}
