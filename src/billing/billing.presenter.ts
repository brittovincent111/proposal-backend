import { definedOnly } from 'src/common/utils/patch';
import { DiscountDocument } from './discount.schema';
import { InvoiceDocument } from './invoice.schema';
import { PlanDocument } from './plan.schema';
import { SubscriptionDocument } from './subscription.schema';
import { SubscriptionSummary } from './subscriptions.service';

/**
 * Wire shapes for the billing API.
 *
 * Hand-written rather than returned straight from Mongoose so `_id` becomes
 * `id`, dates become ISO strings, and the gateway secret-adjacent fields
 * (customer id) never leave the server.
 */

export function presentPlan(plan: PlanDocument) {
  return {
    id: plan._id.toString(),
    code: plan.code,
    name: plan.name,
    tagline: plan.tagline,
    currency: plan.currency,
    yearlyPrice: plan.yearlyPrice,
    trialDays: plan.trialDays,
    features: plan.features,
    limits: {
      seats: plan.limits.seats,
      quotationsPerMonth: plan.limits.quotationsPerMonth,
      templates: plan.limits.templates,
      customers: plan.limits.customers,
      storageMb: plan.limits.storageMb,
      customBranding: plan.limits.customBranding,
      removeQtnBadge: plan.limits.removeQtnBadge,
      apiAccess: plan.limits.apiAccess,
      prioritySupport: plan.limits.prioritySupport,
    },
    isPublic: plan.isPublic,
    isDefault: plan.isDefault,
    isFeatured: plan.isFeatured,
    isContactSales: plan.isContactSales,
    sortOrder: plan.sortOrder,
    status: plan.status,
  };
}

/** Adds the fields only a platform admin may see. */
export function presentPlanForAdmin(plan: PlanDocument, subscribers: number) {
  return {
    ...presentPlan(plan),
    subscribers,
    gateway: {
      razorpayYearlyPlanId: plan.gateway.razorpayYearlyPlanId,
    },
  };
}

export function presentSubscription(subscription: SubscriptionDocument) {
  return {
    id: subscription._id.toString(),
    organizationId: subscription.organizationId.toString(),
    planId: subscription.planId.toString(),
    planCode: subscription.planCode,
    interval: subscription.interval,
    status: subscription.status,
    currency: subscription.currency,
    amount: subscription.amount,
    currentPeriodStart: subscription.currentPeriodStart?.toISOString() ?? null,
    currentPeriodEnd: subscription.currentPeriodEnd?.toISOString() ?? null,
    trialEndsAt: subscription.trialEndsAt?.toISOString() ?? null,
    cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
    canceledAt: subscription.canceledAt?.toISOString() ?? null,
    provider: subscription.gateway.provider,
    // The hosted checkout URL is the tenant's own; the gateway customer id is not.
    checkoutUrl: subscription.gateway.shortUrl,
  };
}

export function presentSummary(summary: SubscriptionSummary) {
  return {
    subscription: presentSubscription(summary.subscription),
    plan: presentPlan(summary.plan),
    usage: summary.usage,
    entitled: summary.entitled,
    graceEndsAt: summary.graceEndsAt,
    gatewayConfigured: summary.gatewayConfigured,
  };
}

export function presentInvoice(invoice: InvoiceDocument) {
  return {
    id: invoice._id.toString(),
    organizationId: invoice.organizationId.toString(),
    number: invoice.number,
    planCode: invoice.planCode,
    description: invoice.description,
    currency: invoice.currency,
    total: invoice.total,
    status: invoice.status,
    issuedAt: invoice.issuedAt?.toISOString() ?? null,
    paidAt: invoice.paidAt?.toISOString() ?? null,
    hostedUrl: invoice.gateway.hostedUrl,
  };
}

export function presentDiscount(discount: DiscountDocument) {
  return {
    id: discount._id.toString(),
    name: discount.name,
    code: discount.code,
    autoApply: discount.autoApply,
    advertise: discount.advertise,
    planCodes: discount.planCodes ?? [],
    type: discount.type,
    value: discount.value,
    duration: discount.duration,
    eligibility: discount.eligibility,
    organizationIds: (discount.organizationIds ?? []).map((id) => id.toString()),
    maxRedemptions: discount.maxRedemptions,
    redemptionCount: discount.redemptionCount,
    /** Null when uncapped, so the UI can say "unlimited" rather than "0 left". */
    remaining:
      discount.maxRedemptions > 0
        ? Math.max(0, discount.maxRedemptions - discount.redemptionCount)
        : null,
    startsAt: discount.startsAt?.toISOString() ?? null,
    endsAt: discount.endsAt?.toISOString() ?? null,
    stackable: discount.stackable,
    internalNote: discount.internalNote,
    status: discount.status,
  };
}

/**
 * DTO → model. Dates arrive as ISO strings and organization ids as strings;
 * Mongoose casts the ids itself but not the dates, and an unparsed date string
 * would silently become null.
 */
export function toDiscountModel(input: {
  startsAt?: string;
  endsAt?: string;
}): Record<string, unknown> {
  const { startsAt, endsAt, ...rest } = input;
  return {
    ...definedOnly(rest),
    ...(startsAt !== undefined ? { startsAt: startsAt ? new Date(startsAt) : null } : {}),
    ...(endsAt !== undefined ? { endsAt: endsAt ? new Date(endsAt) : null } : {}),
  };
}
