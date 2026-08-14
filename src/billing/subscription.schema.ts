import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

import { BillingInterval, BillingIntervals } from './plan.schema';

export type SubscriptionStatus =
  /** Inside the free trial; full access, nothing charged yet. */
  | 'TRIALING'
  /** Paid and current. */
  | 'ACTIVE'
  /** A charge failed. Access continues through the grace window, then EXPIRED. */
  | 'PAST_DUE'
  /** Cancelled but still inside the paid period. */
  | 'CANCELED'
  /** Period elapsed with no successful payment. Read-only access. */
  | 'EXPIRED';

export const SubscriptionStatuses: SubscriptionStatus[] = [
  'TRIALING',
  'ACTIVE',
  'PAST_DUE',
  'CANCELED',
  'EXPIRED',
];

/** Statuses that still entitle the tenant to their plan's limits. */
export const ENTITLED_STATUSES: SubscriptionStatus[] = [
  'TRIALING',
  'ACTIVE',
  'PAST_DUE',
  'CANCELED',
];

export type GatewayProvider = 'RAZORPAY' | 'MANUAL';

@Schema({ _id: false })
export class SubscriptionGatewayRefs {
  @Prop({ type: String, default: 'MANUAL', enum: ['RAZORPAY', 'MANUAL'] })
  provider!: GatewayProvider;

  @Prop({ type: String, default: null })
  subscriptionId!: string | null;

  @Prop({ type: String, default: null })
  customerId!: string | null;

  /** Razorpay's hosted checkout page for this subscription. */
  @Prop({ type: String, default: null })
  shortUrl!: string | null;
}

export const SubscriptionGatewayRefsSchema = SchemaFactory.createForClass(SubscriptionGatewayRefs);

/**
 * One per organization — a tenant is on exactly one plan at a time. The unique
 * index on organizationId is what enforces that, not application code.
 */
@Schema({ collection: 'billing_subscriptions', timestamps: true })
export class Subscription {
  @Prop({ type: Types.ObjectId, required: true, unique: true })
  organizationId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true, index: true })
  planId!: Types.ObjectId;

  /**
   * Denormalised from the plan so the admin list can group by tier without a
   * lookup, and so a deleted plan still reports what the tenant was sold.
   */
  @Prop({ type: String, required: true })
  planCode!: string;

  @Prop({ type: String, default: 'YEARLY', enum: BillingIntervals })
  interval!: BillingInterval;

  @Prop({ type: String, default: 'TRIALING', enum: SubscriptionStatuses, index: true })
  status!: SubscriptionStatus;

  @Prop({ type: String, default: 'INR', uppercase: true })
  currency!: string;

  /** What this tenant actually pays per interval — frozen at subscribe time so
   *  a later price rise does not silently reprice existing customers. */
  @Prop({ type: Number, default: 0, min: 0 })
  amount!: number;

  @Prop({ type: Date, default: () => new Date() })
  currentPeriodStart!: Date;

  @Prop({ type: Date, required: true, index: true })
  currentPeriodEnd!: Date;

  @Prop({ type: Date, default: null })
  trialEndsAt!: Date | null;

  /** Set by "cancel at period end"; the subscription stays usable until then. */
  @Prop({ type: Boolean, default: false })
  cancelAtPeriodEnd!: boolean;

  @Prop({ type: Date, default: null })
  canceledAt!: Date | null;

  /** Free-text note written by a platform admin when they override a plan. */
  @Prop({ type: String, default: '' })
  adminNote!: string;

  @Prop({ type: SubscriptionGatewayRefsSchema, default: () => ({}) })
  gateway!: SubscriptionGatewayRefs;
}

export type SubscriptionDocument = HydratedDocument<Subscription>;
export const SubscriptionSchema = SchemaFactory.createForClass(Subscription);

SubscriptionSchema.index({ organizationId: 1 }, { unique: true });
SubscriptionSchema.index({ 'gateway.subscriptionId': 1 }, { sparse: true });
SubscriptionSchema.index({ status: 1, currentPeriodEnd: 1 });
