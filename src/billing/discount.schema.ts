import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';


/**
 * PERCENT  — take N% off the list price.
 * AMOUNT   — take a fixed number of paise off.
 * OVERRIDE — charge this price instead, whatever the plan lists.
 *
 * OVERRIDE is what makes a launch offer expressible: "Starter is ₹1,500/yr for
 * founding customers" is a price, not a percentage, and deriving the percentage
 * would drift the moment the list price changes.
 */
export type DiscountType = 'PERCENT' | 'AMOUNT' | 'OVERRIDE';
export const DiscountTypes: DiscountType[] = ['PERCENT', 'AMOUNT', 'OVERRIDE'];

/** How many billing cycles the discount survives. */
export type DiscountDuration = 'FIRST_PAYMENT' | 'MONTHS_3' | 'MONTHS_12' | 'LIFETIME';
export const DiscountDurations: DiscountDuration[] = [
  'FIRST_PAYMENT',
  'MONTHS_3',
  'MONTHS_12',
  'LIFETIME',
];

export type DiscountEligibility = 'ALL' | 'NEW_ONLY' | 'SPECIFIC_ORGS';
export const DiscountEligibilities: DiscountEligibility[] = ['ALL', 'NEW_ONLY', 'SPECIFIC_ORGS'];

export type DiscountStatus = 'ACTIVE' | 'INACTIVE';

@Schema({ collection: 'billing_discounts', timestamps: true })
export class Discount {
  /** Shown to the operator, never to the customer. */
  @Prop({ type: String, required: true, trim: true })
  name!: string;

  /**
   * Typed by the customer. Stored uppercase so LAUNCH30 and launch30 are the
   * same coupon; the unique index is what actually prevents duplicates.
   */
  @Prop({ type: String, required: true, unique: true, uppercase: true, trim: true })
  code!: string;

  /**
   * Applied without anyone typing the code — the "always 20% off annual" case.
   * An auto-apply discount still has a code so support can refer to it.
   */
  @Prop({ type: Boolean, default: false })
  autoApply!: boolean;

  /**
   * Shown on the public pricing page.
   *
   * Separate from `status`: a live offer is one the engine will honour, an
   * advertised offer is one customers are told about. A win-back code is live
   * but must never be listed, or it stops being a win-back and becomes the
   * price. Off by default — publishing an offer is a decision.
   */
  @Prop({ type: Boolean, default: false })
  advertise!: boolean;

  /** Empty means every plan. */
  @Prop({ type: [String], default: [] })
  planCodes!: string[];

  @Prop({ type: String, required: true, enum: DiscountTypes })
  type!: DiscountType;

  /** Percent (0–100) for PERCENT; minor units for AMOUNT and OVERRIDE. */
  @Prop({ type: Number, required: true, min: 0 })
  value!: number;

  @Prop({ type: String, default: 'FIRST_PAYMENT', enum: DiscountDurations })
  duration!: DiscountDuration;

  @Prop({ type: String, default: 'ALL', enum: DiscountEligibilities })
  eligibility!: DiscountEligibility;

  /** Only consulted when eligibility is SPECIFIC_ORGS. */
  @Prop({ type: [Types.ObjectId], default: [] })
  organizationIds!: Types.ObjectId[];

  /** 0 means unlimited. This is the "first 100 customers" cap. */
  @Prop({ type: Number, default: 0, min: 0 })
  maxRedemptions!: number;

  /**
   * Denormalised count, kept for display and cheap filtering. It is *not* the
   * cap's enforcement — that is the unique index on DiscountRedemption, because
   * two people checking out in the same millisecond both read the same count.
   */
  @Prop({ type: Number, default: 0, min: 0 })
  redemptionCount!: number;

  @Prop({ type: Date, default: null })
  startsAt!: Date | null;

  @Prop({ type: Date, default: null })
  endsAt!: Date | null;

  /** Whether this may combine with another discount on the same checkout. */
  @Prop({ type: Boolean, default: false })
  stackable!: boolean;

  @Prop({ type: String, default: '' })
  internalNote!: string;

  @Prop({ type: String, default: 'ACTIVE', enum: ['ACTIVE', 'INACTIVE'] })
  status!: DiscountStatus;
}

export type DiscountDocument = HydratedDocument<Discount>;
export const DiscountSchema = SchemaFactory.createForClass(Discount);

// code's unique index comes from `unique: true` on the prop above.
DiscountSchema.index({ status: 1, autoApply: 1 });

/**
 * One row per organization that has used a discount.
 *
 * The compound unique index is the real guard on both "new customers only" and
 * the redemption cap: concurrent checkouts race to insert, and only one wins.
 */
@Schema({ collection: 'billing_discount_redemptions', timestamps: true })
export class DiscountRedemption {
  @Prop({ type: Types.ObjectId, required: true, index: true })
  discountId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true, index: true })
  organizationId!: Types.ObjectId;

  @Prop({ type: String, required: true })
  code!: string;

  @Prop({ type: String, default: '' })
  planCode!: string;

  /** Minor units taken off the list price at the moment it was applied. */
  @Prop({ type: Number, default: 0 })
  amountOff!: number;

  @Prop({ type: Date, default: () => new Date() })
  redeemedAt!: Date;
}

export type DiscountRedemptionDocument = HydratedDocument<DiscountRedemption>;
export const DiscountRedemptionSchema = SchemaFactory.createForClass(DiscountRedemption);

DiscountRedemptionSchema.index({ discountId: 1, organizationId: 1 }, { unique: true });
