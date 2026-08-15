import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type PlanStatus = 'ACTIVE' | 'ARCHIVED';

/**
 * Everything is sold by the year.
 *
 * Monthly billing was withdrawn: the amounts are small enough that a monthly
 * charge costs more in gateway fees and failed-payment handling than it earns.
 * The type stays a union of one so the interval remains explicit at every call
 * site and in the stored subscription, rather than becoming an implicit fact.
 */
export type BillingInterval = 'YEARLY';
export const BillingIntervals: BillingInterval[] = ['YEARLY'];

/**
 * `-1` means unlimited. Zero is a real limit (the feature is off), so absence
 * and "no ceiling" must not share a value — a missing field would otherwise
 * read as "0 quotations allowed" and lock every tenant out on deploy.
 */
export const UNLIMITED = -1;

@Schema({ _id: false })
export class PlanLimits {
  @Prop({ type: Number, default: 3 })
  seats!: number;

  @Prop({ type: Number, default: 25 })
  quotationsPerMonth!: number;

  @Prop({ type: Number, default: 5 })
  templates!: number;

  @Prop({ type: Number, default: 100 })
  customers!: number;

  @Prop({ type: Number, default: 200 })
  storageMb!: number;

  @Prop({ type: Boolean, default: false })
  customBranding!: boolean;

  @Prop({ type: Boolean, default: false })
  removeQtnBadge!: boolean;

  @Prop({ type: Boolean, default: false })
  apiAccess!: boolean;

  @Prop({ type: Boolean, default: false })
  prioritySupport!: boolean;
}

export const PlanLimitsSchema = SchemaFactory.createForClass(PlanLimits);

/** Razorpay plan ids, created once in their dashboard and referenced here. */
@Schema({ _id: false })
export class PlanGatewayRefs {
  @Prop({ type: String, default: null })
  razorpayYearlyPlanId!: string | null;
}

export const PlanGatewayRefsSchema = SchemaFactory.createForClass(PlanGatewayRefs);

/**
 * A sellable tier. Prices are integer minor units (paise) for the same reason
 * quotation money is — map.md §20 forbids floating-point money arithmetic.
 */
@Schema({ collection: 'billing_plans', timestamps: true })
export class Plan {
  /** Stable machine key. Referenced by seeds and webhooks, so it never changes. */
  @Prop({ type: String, required: true, unique: true, lowercase: true, trim: true })
  code!: string;

  @Prop({ type: String, required: true, trim: true })
  name!: string;

  @Prop({ type: String, default: '' })
  tagline!: string;

  @Prop({ type: String, default: 'INR', uppercase: true })
  currency!: string;

  /** Charged once per year. The only price a plan has. */
  @Prop({ type: Number, default: 0, min: 0 })
  yearlyPrice!: number;

  @Prop({ type: Number, default: 0, min: 0 })
  trialDays!: number;

  /** Marketing bullets, in display order. */
  @Prop({ type: [String], default: [] })
  features!: string[];

  @Prop({ type: PlanLimitsSchema, default: () => ({}) })
  limits!: PlanLimits;

  /** Hidden plans still work for their existing subscribers; they just stop being sold. */
  @Prop({ type: Boolean, default: true })
  isPublic!: boolean;

  /** The plan a brand-new organization is placed on. Exactly one should carry this. */
  @Prop({ type: Boolean, default: false })
  isDefault!: boolean;

  /** Drawn with the "Most popular" ribbon on the pricing page. */
  @Prop({ type: Boolean, default: false })
  isFeatured!: boolean;

  /**
   * Sold by conversation, not by checkout — Enterprise.
   *
   * Distinct from a zero price, which means free: a contact-sales plan shows
   * "Custom" instead of a figure and offers a contact route rather than a
   * checkout button, and `startCheckout` refuses it.
   */
  @Prop({ type: Boolean, default: false })
  isContactSales!: boolean;

  @Prop({ type: Number, default: 0 })
  sortOrder!: number;

  @Prop({ type: String, default: 'ACTIVE', enum: ['ACTIVE', 'ARCHIVED'] })
  status!: PlanStatus;

  @Prop({ type: PlanGatewayRefsSchema, default: () => ({}) })
  gateway!: PlanGatewayRefs;
}

export type PlanDocument = HydratedDocument<Plan>;
export const PlanSchema = SchemaFactory.createForClass(Plan);

// code's unique index comes from `unique: true` on the prop above.
PlanSchema.index({ status: 1, isPublic: 1, sortOrder: 1 });

/** What a plan costs for a year, in minor units. */
export function planPrice(plan: Pick<Plan, 'yearlyPrice'>): number {
  return plan.yearlyPrice;
}

/**
 * A yearly price expressed per month.
 *
 * Used for MRR, and for the pricing page's "per month, billed yearly" figure.
 * It is a presentation of the yearly price, never an amount anyone is charged.
 */
export function monthlyEquivalent(amount: number): number {
  return Math.round(amount / 12);
}
