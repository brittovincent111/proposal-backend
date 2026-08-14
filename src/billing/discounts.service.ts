import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types, isValidObjectId } from 'mongoose';

import { DomainException } from 'src/common/errors/domain.exception';
import { ErrorCodes } from 'src/common/errors/error-codes';
import { DISCOUNT_PRESETS } from './discount-presets';
import {
  Discount,
  DiscountDocument,
  DiscountRedemption,
  DiscountRedemptionDocument,
} from './discount.schema';
import { PlanDocument, planPrice } from './plan.schema';

export interface PricedOffer {
  listPrice: number;
  amountOff: number;
  /** What the customer actually pays. Never below zero. */
  payable: number;
  currency: string;
  discount: {
    id: string;
    code: string;
    name: string;
    type: string;
    duration: string;
  } | null;
}

@Injectable()
export class DiscountsService implements OnModuleInit {
  private readonly logger = new Logger(DiscountsService.name);

  constructor(
    @InjectModel(Discount.name) private readonly discounts: Model<DiscountDocument>,
    @InjectModel(DiscountRedemption.name)
    private readonly redemptions: Model<DiscountRedemptionDocument>,
  ) {}

  /**
   * Seeds the shipped offers, insert-only and INACTIVE — see discount-presets.
   * A redeploy must never resurrect an offer an admin has switched off.
   */
  async onModuleInit(): Promise<void> {
    for (const preset of DISCOUNT_PRESETS) {
      try {
        const result = await this.discounts.updateOne(
          { code: preset.code },
          { $setOnInsert: preset },
          { upsert: true },
        );
        if (result.upsertedCount) this.logger.log(`Seeded discount "${preset.code}"`);
      } catch (error) {
        if ((error as { code?: number }).code !== 11000) throw error;
      }
    }
  }

  // ------------------------------------------------------------------ pricing

  /**
   * The price a tenant would actually pay for a plan, after any discount.
   *
   * `code` is what the customer typed; when it is absent the best auto-apply
   * offer is used instead. Never throws for "no discount" — an unusable code is
   * only an error when the customer explicitly supplied one, because silently
   * ignoring what someone typed is how billing complaints start.
   */
  async priceFor(
    organizationId: string,
    plan: PlanDocument,
    code?: string,
  ): Promise<PricedOffer> {
    const listPrice = planPrice(plan);
    const base: PricedOffer = {
      listPrice,
      amountOff: 0,
      payable: listPrice,
      currency: plan.currency,
      discount: null,
    };

    if (listPrice <= 0) return base;

    const discount = code
      ? await this.resolveCode(organizationId, plan, code)
      : await this.bestAutoApply(organizationId, plan);

    if (!discount) return base;

    const amountOff = Math.min(listPrice, computeAmountOff(discount, listPrice));

    return {
      listPrice,
      amountOff,
      payable: Math.max(0, listPrice - amountOff),
      currency: plan.currency,
      discount: {
        id: discount._id.toString(),
        code: discount.code,
        name: discount.name,
        type: discount.type,
        duration: discount.duration,
      },
    };
  }

  /** Looks up a customer-supplied code and explains precisely why it cannot be used. */
  private async resolveCode(
    organizationId: string,
    plan: PlanDocument,
    code: string,
  ): Promise<DiscountDocument> {
    const discount = await this.discounts.findOne({ code: code.toUpperCase().trim() });
    if (!discount) {
      throw DomainException.invalid(ErrorCodes.DISCOUNT_NOT_FOUND, 'That code is not recognised.');
    }

    const problem = await this.reasonUnusable(discount, organizationId, plan);
    if (problem) throw DomainException.invalid(ErrorCodes.DISCOUNT_NOT_APPLICABLE, problem);

    return discount;
  }

  /** The auto-apply offer that saves the customer the most, or none. */
  private async bestAutoApply(
    organizationId: string,
    plan: PlanDocument,
  ): Promise<DiscountDocument | null> {
    const candidates = await this.discounts.find({ status: 'ACTIVE', autoApply: true });
    const listPrice = planPrice(plan);

    let winner: DiscountDocument | null = null;
    let best = 0;

    for (const candidate of candidates) {
      if (await this.reasonUnusable(candidate, organizationId, plan)) continue;
      const off = Math.min(listPrice, computeAmountOff(candidate, listPrice));
      if (off > best) {
        best = off;
        winner = candidate;
      }
    }

    return winner;
  }

  /** Null when the discount applies; otherwise a sentence for the customer. */
  private async reasonUnusable(
    discount: DiscountDocument,
    organizationId: string,
    plan: PlanDocument,
  ): Promise<string | null> {
    const now = new Date();

    if (discount.status !== 'ACTIVE') return 'That offer is no longer running.';
    if (discount.startsAt && now < discount.startsAt) return 'That offer has not started yet.';
    if (discount.endsAt && now > discount.endsAt) return 'That offer has expired.';

    if (discount.planCodes.length && !discount.planCodes.includes(plan.code)) {
      return `That offer does not apply to the ${plan.name} plan.`;
    }

    if (discount.maxRedemptions > 0 && discount.redemptionCount >= discount.maxRedemptions) {
      return 'That offer has been fully claimed.';
    }

    if (!isValidObjectId(organizationId)) return 'That offer is not available for this account.';
    const orgId = new Types.ObjectId(organizationId);

    if (discount.eligibility === 'SPECIFIC_ORGS') {
      const allowed = discount.organizationIds.some((id) => id.equals(orgId));
      if (!allowed) return 'That offer is not available for this account.';
    }

    // Reusing a one-per-customer offer is the common case, so it is checked last
    // and phrased as a fact rather than a rejection.
    const already = await this.redemptions.exists({ discountId: discount._id, organizationId: orgId });
    if (already) return 'You have already used that offer.';

    return null;
  }

  /**
   * Offers to show on the public pricing page.
   *
   * Only what is both live and advertised, and only within its dates — an
   * expired banner is worse than none. Deliberately not eligibility-aware: this
   * runs for anonymous visitors, so it advertises the offer and the engine
   * decides at checkout whether that particular customer qualifies.
   */
  async listAdvertised(): Promise<DiscountDocument[]> {
    const now = new Date();
    const rows = await this.discounts
      .find({
        status: 'ACTIVE',
        advertise: true,
        $and: [
          { $or: [{ startsAt: null }, { startsAt: { $lte: now } }] },
          { $or: [{ endsAt: null }, { endsAt: { $gte: now } }] },
        ],
      })
      .sort({ createdAt: -1 });

    // A fully claimed offer is still ACTIVE but has nothing left to give.
    return rows.filter((row) => row.maxRedemptions === 0 || row.redemptionCount < row.maxRedemptions);
  }

  // --------------------------------------------------------------- redemption

  /**
   * Records that an organization used a discount.
   *
   * The unique index on (discountId, organizationId) is what makes the
   * redemption cap and "new customers only" real: two checkouts racing both
   * pass the count check above, and exactly one of them wins this insert.
   * Returns false when the caller lost that race.
   */
  async redeem(
    discountId: string,
    organizationId: string,
    context: { code: string; planCode: string; amountOff: number },
  ): Promise<boolean> {
    try {
      await this.redemptions.create({
        discountId: new Types.ObjectId(discountId),
        organizationId: new Types.ObjectId(organizationId),
        code: context.code,
        planCode: context.planCode,
        amountOff: context.amountOff,
      });
    } catch (error) {
      if ((error as { code?: number }).code === 11000) return false;
      throw error;
    }

    // Advisory counter for the admin list; the index above is the real guard.
    await this.discounts.updateOne({ _id: discountId }, { $inc: { redemptionCount: 1 } });
    this.logger.log(`Discount ${context.code} redeemed by organization ${organizationId}`);
    return true;
  }

  // -------------------------------------------------------------------- admin

  listAll(): Promise<DiscountDocument[]> {
    return this.discounts.find().sort({ createdAt: -1 }).exec();
  }

  async findById(id: string): Promise<DiscountDocument> {
    const discount = isValidObjectId(id) ? await this.discounts.findById(id) : null;
    if (!discount) {
      throw DomainException.notFound(ErrorCodes.DISCOUNT_NOT_FOUND, 'That offer does not exist.');
    }
    return discount;
  }

  async create(input: Partial<Discount>): Promise<DiscountDocument> {
    const code = (input.code ?? '').toUpperCase().trim();
    if (await this.discounts.exists({ code })) {
      throw DomainException.conflict(
        ErrorCodes.DISCOUNT_CODE_TAKEN,
        `A discount with the code "${code}" already exists.`,
      );
    }
    const created = await this.discounts.create({ ...input, code });
    if (created.advertise) await this.claimTheBanner(created._id);
    return created;
  }

  /**
   * Exactly one offer is shown on the pricing page.
   *
   * Every visitor sees the same banner, so two advertised offers would be two
   * competing headline prices with no way for the page to choose between them.
   * Promoting one therefore demotes the rest — enforced here rather than in the
   * console, because the API is what the pricing page reads.
   */
  private async claimTheBanner(keepId: Types.ObjectId): Promise<void> {
    await this.discounts.updateMany(
      { _id: { $ne: keepId }, advertise: true },
      { $set: { advertise: false } },
    );
  }

  async update(id: string, patch: Partial<Discount>): Promise<DiscountDocument> {
    const discount = await this.findById(id);
    if (patch.advertise === true) await this.claimTheBanner(discount._id);
    // `code` and `redemptionCount` are deliberately not patchable: changing a
    // code orphans links already sent out, and the count belongs to the ledger.
    const { code: _code, redemptionCount: _count, ...rest } = patch;
    discount.set(rest);
    return discount.save();
  }

  redemptionsFor(discountId: string): Promise<DiscountRedemptionDocument[]> {
    return this.redemptions
      .find({ discountId: new Types.ObjectId(discountId) })
      .sort({ redeemedAt: -1 })
      .limit(200)
      .exec();
  }
}

/** Minor units taken off `listPrice`, per the discount's type. */
function computeAmountOff(discount: DiscountDocument, listPrice: number): number {
  switch (discount.type) {
    case 'PERCENT':
      return Math.round((listPrice * Math.min(100, discount.value)) / 100);
    case 'AMOUNT':
      return Math.min(listPrice, discount.value);
    case 'OVERRIDE':
      // The value is the price to charge, so the saving is whatever is above it.
      return Math.max(0, listPrice - discount.value);
    default:
      return 0;
  }
}
