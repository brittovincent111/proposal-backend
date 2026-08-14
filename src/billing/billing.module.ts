import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { BillingWebhookController } from './billing-webhook.controller';
import { BillingController } from './billing.controller';
import { BillingCounter, BillingCounterSchema } from './counter.schema';
import {
  Discount,
  DiscountRedemption,
  DiscountRedemptionSchema,
  DiscountSchema,
} from './discount.schema';
import { DiscountsService } from './discounts.service';
import { EntitlementsService } from './entitlements.service';
import { Invoice, InvoiceSchema } from './invoice.schema';
import { InvoicesService } from './invoices.service';
import { Plan, PlanSchema } from './plan.schema';
import { PlansService } from './plans.service';
import { RazorpayGateway } from './razorpay.gateway';
import { Subscription, SubscriptionSchema } from './subscription.schema';
import { SubscriptionsService } from './subscriptions.service';
import { WebhookEvent, WebhookEventSchema } from './webhook-event.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Plan.name, schema: PlanSchema },
      { name: Subscription.name, schema: SubscriptionSchema },
      { name: Invoice.name, schema: InvoiceSchema },
      { name: BillingCounter.name, schema: BillingCounterSchema },
      { name: WebhookEvent.name, schema: WebhookEventSchema },
      { name: Discount.name, schema: DiscountSchema },
      { name: DiscountRedemption.name, schema: DiscountRedemptionSchema },
    ]),
  ],
  controllers: [BillingController, BillingWebhookController],
  providers: [
    PlansService,
    SubscriptionsService,
    InvoicesService,
    EntitlementsService,
    DiscountsService,
    RazorpayGateway,
  ],
  // Exported so feature modules can gate on a plan limit, and so the platform
  // admin console can read the same numbers the tenant sees.
  exports: [PlansService, SubscriptionsService, InvoicesService, EntitlementsService, DiscountsService],
})
export class BillingModule {}
