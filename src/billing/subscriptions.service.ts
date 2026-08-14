import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types, isValidObjectId } from 'mongoose';

import { APP_CONFIG } from 'src/common/config/config.module';
import { AppConfig } from 'src/common/config/configuration';
import { DomainException } from 'src/common/errors/domain.exception';
import { ErrorCodes } from 'src/common/errors/error-codes';
import {
  AssignPlanDto,
  CancelSubscriptionDto,
  StartCheckoutDto,
  VerifyCheckoutDto,
} from './dto/billing.dto';
import { DiscountsService } from './discounts.service';
import { EntitlementsService, UsageReport } from './entitlements.service';
import { InvoicesService } from './invoices.service';
import { BillingInterval, PlanDocument, PlanLimits, planPrice } from './plan.schema';
import { PlansService } from './plans.service';
import { RazorpayGateway } from './razorpay.gateway';
import {
  ENTITLED_STATUSES,
  Subscription,
  SubscriptionDocument,
  SubscriptionStatus,
} from './subscription.schema';

export interface CheckoutSession {
  /** Publishable Razorpay key the browser hands to Checkout.js. */
  keyId: string;
  subscriptionId: string;
  /** Razorpay's hosted page — the fallback when Checkout.js cannot be opened. */
  shortUrl: string | null;
  planCode: string;
  interval: BillingInterval;
  /** List price for the interval, before any offer. */
  amount: number;
  /** What the customer is actually charged. */
  payable: number;
  amountOff: number;
  discountCode: string | null;
  discountName: string | null;
  currency: string;
}

export interface Entitlement {
  planCode: string;
  planName: string;
  status: SubscriptionStatus;
  limits: PlanLimits;
  /** False once the grace window after a failed payment has elapsed. */
  active: boolean;
}

export interface SubscriptionSummary {
  subscription: SubscriptionDocument;
  plan: PlanDocument;
  usage: UsageReport;
  entitled: boolean;
  /** Null unless the subscription is PAST_DUE. */
  graceEndsAt: string | null;
  gatewayConfigured: boolean;
}

export function addDays(from: Date, days: number): Date {
  const next = new Date(from);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

export function addMonths(from: Date, months: number): Date {
  const next = new Date(from);
  next.setUTCMonth(next.getUTCMonth() + months);
  return next;
}

@Injectable()
export class SubscriptionsService {
  private readonly logger = new Logger(SubscriptionsService.name);

  constructor(
    @InjectModel(Subscription.name)
    private readonly subscriptions: Model<SubscriptionDocument>,
    private readonly plans: PlansService,
    private readonly invoices: InvoicesService,
    private readonly entitlements: EntitlementsService,
    private readonly discounts: DiscountsService,
    private readonly razorpay: RazorpayGateway,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  // ---------------------------------------------------------------- lifecycle

  /**
   * The organization's subscription, creating a default-plan one if it has none.
   *
   * Provisioning lazily rather than inside `OrganizationsService.provision`
   * keeps billing out of the signup path and, more usefully, back-fills every
   * organization that existed before billing shipped.
   */
  async ensureFor(organizationId: string): Promise<SubscriptionDocument> {
    const orgId = new Types.ObjectId(organizationId);
    const existing = await this.subscriptions.findOne({ organizationId: orgId });
    if (existing) return existing;

    const plan = await this.plans.defaultPlan();
    const now = new Date();

    try {
      return await this.subscriptions.create({
        organizationId: orgId,
        planId: plan._id,
        planCode: plan.code,
        interval: 'YEARLY',
        status: 'ACTIVE',
        currency: plan.currency,
        amount: plan.yearlyPrice,
        currentPeriodStart: now,
        currentPeriodEnd: addMonths(now, 12),
        trialEndsAt: null,
      });
    } catch (error) {
      // Two requests can race into the same first-read. organizationId is
      // unique, so the loser just re-reads the winner's row.
      if (!isDuplicateKey(error)) throw error;
      const raced = await this.subscriptions.findOne({ organizationId: orgId });
      if (!raced) throw error;
      return raced;
    }
  }

  async summaryFor(organizationId: string): Promise<SubscriptionSummary> {
    const subscription = await this.ensureFor(organizationId);
    const plan = await this.plans.findById(subscription.planId);
    const usage = await this.entitlements.usageFor(organizationId, plan.limits);

    return {
      subscription,
      plan,
      usage,
      entitled: this.isEntitled(subscription),
      graceEndsAt:
        subscription.status === 'PAST_DUE'
          ? addDays(subscription.currentPeriodEnd, this.config.BILLING_GRACE_DAYS).toISOString()
          : null,
      gatewayConfigured: this.razorpay.isConfigured,
    };
  }

  /** Plan limits plus whether they currently apply. Used by feature gates. */
  async entitlementFor(organizationId: string): Promise<Entitlement> {
    const subscription = await this.ensureFor(organizationId);
    const plan = await this.plans.findById(subscription.planId);
    return {
      planCode: plan.code,
      planName: plan.name,
      status: subscription.status,
      limits: plan.limits,
      active: this.isEntitled(subscription),
    };
  }

  /**
   * Whether the tenant may still use their plan's allowances.
   *
   * A free plan never lapses — there is nothing to renew, so an elapsed period
   * on a zero-amount subscription is bookkeeping, not a missed payment. A
   * PAST_DUE tenant keeps working through the grace window so a card that fails
   * on a Friday does not lock a sales team out over the weekend.
   */
  isEntitled(subscription: SubscriptionDocument, now = new Date()): boolean {
    if (!ENTITLED_STATUSES.includes(subscription.status)) return false;
    if (subscription.amount === 0) return true;

    const deadline =
      subscription.status === 'PAST_DUE'
        ? addDays(subscription.currentPeriodEnd, this.config.BILLING_GRACE_DAYS)
        : subscription.currentPeriodEnd;

    return now <= deadline;
  }

  // ----------------------------------------------------------------- checkout

  /**
   * Opens a Razorpay subscription for the chosen plan and returns what the
   * browser needs to launch Checkout.
   *
   * Nothing about the local subscription changes here — a tenant who abandons
   * checkout must stay on the plan they are already paying for. The move
   * happens in `verifyCheckout`, or in the webhook if they close the tab
   * mid-payment.
   */
  async startCheckout(
    organizationId: string,
    actor: { email: string; name: string },
    input: StartCheckoutDto,
  ): Promise<CheckoutSession> {
    if (!this.razorpay.isConfigured) {
      throw new DomainException(
        ErrorCodes.BILLING_NOT_CONFIGURED,
        'Online payments are not enabled on this deployment. Contact support to change your plan.',
        503,
      );
    }

    const interval: BillingInterval = 'YEARLY';
    const plan = await this.plans.findByCode(input.planCode);

    if (plan.status !== 'ACTIVE') {
      throw DomainException.invalid(ErrorCodes.PLAN_NOT_FOUND, 'That plan is no longer available.');
    }

    if (plan.isContactSales) {
      // Enterprise is priced per deal, so there is no amount to charge. A
      // platform admin moves the tenant onto it once terms are agreed.
      throw DomainException.invalid(
        ErrorCodes.PLAN_NOT_FOUND,
        `${plan.name} is priced individually. Contact sales and we will set it up for you.`,
      );
    }

    const amount = planPrice(plan);
    if (amount === 0) {
      // Moving to a free tier is a local state change, not a payment.
      throw DomainException.invalid(
        ErrorCodes.PLAN_NOT_FOUND,
        'This plan is free — no checkout is needed. Cancel your current plan instead.',
      );
    }

    const gatewayPlanId = plan.gateway.razorpayYearlyPlanId;

    if (!gatewayPlanId) {
      throw new DomainException(
        ErrorCodes.GATEWAY_PLAN_NOT_LINKED,
        `The ${plan.name} plan is not linked to a Razorpay plan for yearly billing.`,
        503,
      );
    }

    const subscription = await this.ensureFor(organizationId);
    const customer = await this.razorpay.createCustomer({
      name: actor.name || actor.email,
      email: actor.email,
    });

    // A first-time subscriber's trial is expressed as a start date in the
    // future — Razorpay charges cycle one at `start_at` and has no trial flag.
    const trialDays = subscription.trialEndsAt
      ? 0
      : plan.trialDays || this.config.BILLING_TRIAL_DAYS;
    const startAt =
      trialDays > 0 ? Math.floor(addDays(new Date(), trialDays).getTime() / 1000) : null;

    // Priced before the gateway call so a rejected code fails cheaply, before a
    // subscription exists that nobody will pay for.
    const offer = await this.discounts.priceFor(organizationId, plan, input.discountCode);

    const created = await this.razorpay.createSubscription({
      gatewayPlanId,
      customerId: customer.id,
      startAt,
      notes: {
        organizationId,
        planCode: plan.code,
        ...(offer.discount ? { discountCode: offer.discount.code } : {}),
      },
    });

    if (offer.discount) {
      // Claim the redemption now. Losing the race means the last seat went to
      // someone else between pricing and here, so the customer pays list price
      // rather than silently receiving an offer that was already exhausted.
      const claimed = await this.discounts.redeem(offer.discount.id, organizationId, {
        code: offer.discount.code,
        planCode: plan.code,
        amountOff: offer.amountOff,
      });
      if (!claimed) {
        this.logger.warn(`Discount ${offer.discount.code} was exhausted during checkout`);
        offer.discount = null;
        offer.amountOff = 0;
        offer.payable = offer.listPrice;
      }
    }

    subscription.gateway.provider = 'RAZORPAY';
    subscription.gateway.subscriptionId = created.id;
    subscription.gateway.customerId = customer.id;
    subscription.gateway.shortUrl = created.shortUrl;
    subscription.markModified('gateway');
    await subscription.save();

    return {
      keyId: this.razorpay.publicKeyId ?? '',
      subscriptionId: created.id,
      shortUrl: created.shortUrl,
      planCode: plan.code,
      interval,
      amount,
      payable: offer.payable,
      amountOff: offer.amountOff,
      discountCode: offer.discount?.code ?? null,
      discountName: offer.discount?.name ?? null,
      currency: plan.currency,
    };
  }

  /**
   * Confirms the payment the browser just completed and moves the tenant onto
   * the plan. The webhook does the same thing independently; whichever arrives
   * first wins and the other is a no-op.
   */
  async verifyCheckout(
    organizationId: string,
    input: VerifyCheckoutDto,
  ): Promise<SubscriptionDocument> {
    this.razorpay.verifyCheckoutSignature({
      paymentId: input.razorpayPaymentId,
      subscriptionId: input.razorpaySubscriptionId,
      signature: input.razorpaySignature,
    });

    const subscription = await this.ensureFor(organizationId);

    // The signature proves the payment is genuine, not that it belongs to this
    // tenant. Without this check a caller could replay someone else's receipt.
    if (subscription.gateway.subscriptionId !== input.razorpaySubscriptionId) {
      throw DomainException.forbidden(
        'That payment does not belong to this organization.',
        ErrorCodes.CHECKOUT_SIGNATURE_INVALID,
      );
    }

    const remote = await this.razorpay.fetchSubscription(input.razorpaySubscriptionId);
    await this.adoptPlanFromNotes(subscription, input.planCode);
    return this.applyGatewayState(subscription, remote, input.razorpayPaymentId);
  }

  async cancel(organizationId: string, input: CancelSubscriptionDto): Promise<SubscriptionDocument> {
    const subscription = await this.ensureFor(organizationId);
    const immediately = input.immediately ?? false;

    if (subscription.gateway.subscriptionId && this.razorpay.isConfigured) {
      try {
        await this.razorpay.cancelSubscription(subscription.gateway.subscriptionId, {
          atCycleEnd: !immediately,
        });
      } catch (error) {
        // A subscription already cancelled at the gateway must not block the
        // local cancellation — the tenant's intent is unambiguous either way.
        this.logger.warn(
          `Gateway cancel failed for ${subscription.gateway.subscriptionId}; cancelling locally`,
          error as Error,
        );
      }
    }

    subscription.cancelAtPeriodEnd = !immediately;
    subscription.canceledAt = new Date();

    if (immediately) {
      const free = await this.plans.defaultPlan();
      this.moveToPlan(subscription, free, 'ACTIVE', addMonths(new Date(), 12));
      subscription.gateway.provider = 'MANUAL';
      subscription.gateway.subscriptionId = null;
      subscription.gateway.shortUrl = null;
      subscription.markModified('gateway');
    } else {
      subscription.status = 'CANCELED';
    }

    return subscription.save();
  }

  // ------------------------------------------------------------- admin action

  /** Platform-admin override — moves a tenant onto a plan without a payment. */
  async assignPlan(organizationId: string, input: AssignPlanDto): Promise<SubscriptionDocument> {
    const subscription = await this.ensureFor(organizationId);
    const plan = await this.plans.findByCode(input.planCode);
    const days = input.periodDays ?? 365;

    this.moveToPlan(subscription, plan, input.status ?? 'ACTIVE', addDays(new Date(), days));

    subscription.cancelAtPeriodEnd = false;
    subscription.canceledAt = null;
    if (input.note !== undefined) subscription.adminNote = input.note;

    return subscription.save();
  }

  // ----------------------------------------------------------------- webhooks

  findByGatewayId(gatewaySubscriptionId: string): Promise<SubscriptionDocument | null> {
    return this.subscriptions.findOne({ 'gateway.subscriptionId': gatewaySubscriptionId }).exec();
  }

  findForOrganization(organizationId: string): Promise<SubscriptionDocument | null> {
    if (!isValidObjectId(organizationId)) return Promise.resolve(null);
    return this.subscriptions
      .findOne({ organizationId: new Types.ObjectId(organizationId) })
      .exec();
  }

  /**
   * Folds a gateway subscription state into the local row: aligns status and
   * period, and records the invoice for the cycle just paid.
   */
  async applyGatewayState(
    subscription: SubscriptionDocument,
    remote: { id: string; status: string; currentStart: number | null; currentEnd: number | null },
    paymentId: string | null = null,
  ): Promise<SubscriptionDocument> {
    const plan = await this.plans.findById(subscription.planId);
    const status = mapGatewayStatus(remote.status);

    if (remote.currentStart) subscription.currentPeriodStart = new Date(remote.currentStart * 1000);
    if (remote.currentEnd) subscription.currentPeriodEnd = new Date(remote.currentEnd * 1000);

    subscription.status = status;
    subscription.gateway.provider = 'RAZORPAY';
    subscription.gateway.subscriptionId = remote.id;
    subscription.markModified('gateway');

    if (status === 'ACTIVE' || status === 'TRIALING') {
      subscription.cancelAtPeriodEnd = false;
      subscription.canceledAt = null;
    }

    await subscription.save();

    if (paymentId && subscription.amount > 0 && status === 'ACTIVE') {
      await this.invoices.record({
        organizationId: subscription.organizationId,
        subscriptionId: subscription._id,
        planCode: subscription.planCode,
        description: `${plan.name} — yearly subscription`,
        currency: subscription.currency,
        total: subscription.amount,
        status: 'PAID',
        periodStart: subscription.currentPeriodStart,
        periodEnd: subscription.currentPeriodEnd,
        paidAt: new Date(),
        provider: 'RAZORPAY',
        // On this path Razorpay identifies the charge by payment, not invoice;
        // reusing it as the dedupe key keeps redeliveries from double-counting.
        gatewayInvoiceId: paymentId,
        gatewayPaymentId: paymentId,
      });
    }

    return subscription;
  }

  /**
   * Switches a subscription onto a named plan.
   *
   * Checkout deliberately leaves the local plan untouched, so this is what
   * actually performs the upgrade — driven by the plan code carried in the
   * gateway subscription's notes, or by the verify call.
   */
  async adoptPlanFromNotes(
    subscription: SubscriptionDocument,
    planCode: string | undefined,
  ): Promise<void> {
    if (!planCode || planCode === subscription.planCode) return;

    const plan = await this.plans.findByCode(planCode).catch(() => null);
    if (!plan) {
      this.logger.warn(`Webhook named unknown plan "${planCode}"; leaving subscription as-is`);
      return;
    }

    this.moveToPlan(subscription, plan, subscription.status, subscription.currentPeriodEnd);
    await subscription.save();
  }

  async markPastDue(subscription: SubscriptionDocument): Promise<void> {
    // A cancelled subscription that fails a final charge stays cancelled —
    // moving it to PAST_DUE would hand back a grace window it should not get.
    if (subscription.status === 'CANCELED' || subscription.status === 'EXPIRED') return;
    subscription.status = 'PAST_DUE';
    await subscription.save();
  }

  // ---------------------------------------------------------------- internals

  /** Repoints a subscription at a plan, repricing it at that plan's yearly rate. */
  private moveToPlan(
    subscription: SubscriptionDocument,
    plan: PlanDocument,
    status: SubscriptionStatus,
    periodEnd: Date,
  ): void {
    subscription.planId = plan._id;
    subscription.planCode = plan.code;
    subscription.interval = 'YEARLY';
    subscription.status = status;
    subscription.currency = plan.currency;
    subscription.amount = planPrice(plan);
    subscription.currentPeriodStart = new Date();
    subscription.currentPeriodEnd = periodEnd;
  }

  // ------------------------------------------------------------------ reports

  /** Monthly recurring revenue in minor units, across paying subscriptions. */
  async monthlyRecurringRevenue(): Promise<number> {
    const rows = await this.subscriptions.aggregate<{ _id: null; mrr: number }>([
      { $match: { status: { $in: ['ACTIVE', 'PAST_DUE'] }, amount: { $gt: 0 } } },
      {
        $group: {
          _id: null,
          mrr: {
            $sum: {
              // Everything is billed yearly, so a subscriber contributes a
              // twelfth of their annual price to the monthly figure.
              $divide: ['$amount', 12],
            },
          },
        },
      },
    ]);
    return Math.round(rows[0]?.mrr ?? 0);
  }

  countByStatus(): Promise<{ _id: SubscriptionStatus; count: number }[]> {
    return this.subscriptions.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]);
  }

  countByPlan(): Promise<{ _id: string; count: number; mrr: number }[]> {
    return this.subscriptions.aggregate([
      {
        $group: {
          _id: '$planCode',
          count: { $sum: 1 },
          mrr: {
            $sum: {
              $cond: [
                { $in: ['$status', ['ACTIVE', 'PAST_DUE']] },
                {
                  $divide: ['$amount', 12],
                },
                0,
              ],
            },
          },
        },
      },
      { $sort: { mrr: -1 } },
    ]);
  }

  findManyByOrganization(organizationIds: Types.ObjectId[]): Promise<SubscriptionDocument[]> {
    return this.subscriptions.find({ organizationId: { $in: organizationIds } }).exec();
  }
}

/**
 * Razorpay subscription states → ours.
 *
 * `halted` means Razorpay gave up retrying, so it is a harder failure than
 * `pending` — both land on PAST_DUE, and the grace window decides access.
 */
function mapGatewayStatus(status: string): SubscriptionStatus {
  switch (status) {
    case 'created':
    case 'authenticated':
      return 'TRIALING';
    case 'active':
    case 'updated':
      return 'ACTIVE';
    case 'pending':
    case 'halted':
      return 'PAST_DUE';
    case 'cancelled':
      return 'CANCELED';
    case 'completed':
    case 'expired':
      return 'EXPIRED';
    default:
      return 'PAST_DUE';
  }
}

function isDuplicateKey(error: unknown): boolean {
  return Boolean(error) && (error as { code?: number }).code === 11000;
}
