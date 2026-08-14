import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types, isValidObjectId } from 'mongoose';

import { DomainException } from 'src/common/errors/domain.exception';
import { definedOnly } from 'src/common/utils/patch';
import { ErrorCodes } from 'src/common/errors/error-codes';
import { CreatePlanDto, UpdatePlanDto } from './dto/billing.dto';
import { PLAN_CATALOG } from './plan-catalog';
import { Plan, PlanDocument } from './plan.schema';
import { Subscription, SubscriptionDocument } from './subscription.schema';

@Injectable()
export class PlansService implements OnModuleInit {
  private readonly logger = new Logger(PlansService.name);

  constructor(
    @InjectModel(Plan.name) private readonly plans: Model<PlanDocument>,
    @InjectModel(Subscription.name)
    private readonly subscriptions: Model<SubscriptionDocument>,
  ) {}

  /**
   * Seeds the shipped catalogue on first boot.
   *
   * Insert-only by design: once a platform admin edits a price in /admin/plans,
   * a redeploy must not quietly revert it. `code` carries a unique index, so
   * concurrent boots race harmlessly — the loser sees E11000 and moves on.
   */
  async onModuleInit(): Promise<void> {
    for (const seed of PLAN_CATALOG) {
      try {
        const result = await this.plans.updateOne(
          { code: seed.code },
          { $setOnInsert: seed },
          { upsert: true },
        );
        if (result.upsertedCount) this.logger.log(`Seeded billing plan "${seed.code}"`);
      } catch (error) {
        if (!isDuplicateKey(error)) throw error;
      }
    }
  }

  /** Public catalogue for the pricing page — active, listed, in display order. */
  listPublic(): Promise<PlanDocument[]> {
    return this.plans
      .find({ status: 'ACTIVE', isPublic: true })
      .sort({ sortOrder: 1, yearlyPrice: 1 })
      .exec();
  }

  /** Everything, including archived and hidden tiers. Platform admin only. */
  listAll(): Promise<PlanDocument[]> {
    return this.plans.find().sort({ sortOrder: 1, yearlyPrice: 1 }).exec();
  }

  async findByCode(code: string): Promise<PlanDocument> {
    const plan = await this.plans.findOne({ code: code.toLowerCase().trim() });
    if (!plan) throw DomainException.notFound(ErrorCodes.PLAN_NOT_FOUND, 'That plan does not exist.');
    return plan;
  }

  async findById(id: string | Types.ObjectId): Promise<PlanDocument> {
    if (!isValidObjectId(id)) {
      throw DomainException.notFound(ErrorCodes.PLAN_NOT_FOUND, 'That plan does not exist.');
    }
    const plan = await this.plans.findById(id);
    if (!plan) throw DomainException.notFound(ErrorCodes.PLAN_NOT_FOUND, 'That plan does not exist.');
    return plan;
  }

  /** The tier a brand-new organization starts on. */
  async defaultPlan(): Promise<PlanDocument> {
    const plan =
      (await this.plans.findOne({ isDefault: true, status: 'ACTIVE' })) ??
      (await this.plans.findOne({ status: 'ACTIVE' }).sort({ sortOrder: 1 }));

    if (!plan) {
      throw DomainException.notFound(
        ErrorCodes.PLAN_NOT_FOUND,
        'No billing plan is configured on this deployment.',
      );
    }
    return plan;
  }

  async create(input: CreatePlanDto): Promise<PlanDocument> {
    const code = input.code.toLowerCase().trim();
    if (await this.plans.exists({ code })) {
      throw DomainException.conflict(
        ErrorCodes.PLAN_CODE_TAKEN,
        `A plan with the code "${code}" already exists.`,
      );
    }
    return this.plans.create({ ...input, code });
  }

  async update(id: string, patch: UpdatePlanDto): Promise<PlanDocument> {
    const plan = await this.findById(id);

    // Nested objects are replaced wholesale rather than merged: a limits patch
    // that omitted a key would otherwise leave the old ceiling in place, which
    // is the opposite of what "I set the limits to this" means.
    if (patch.limits) plan.set('limits', { ...plan.limits, ...patch.limits });
    if (patch.gateway) plan.set('gateway', { ...plan.gateway, ...patch.gateway });

    const { limits: _limits, gateway: _gateway, ...scalars } = patch;
    // Same reason as the discount mapper: an omitted DTO field arrives as
    // `undefined` and would unset the column rather than leave it alone.
    plan.set(definedOnly(scalars));

    return plan.save();
  }

  /**
   * Archiving, not deleting. A plan with subscribers must keep existing or
   * their subscription rows point at nothing and the admin list breaks.
   */
  async archive(id: string): Promise<PlanDocument> {
    const plan = await this.findById(id);
    if (plan.isDefault) {
      throw DomainException.invalid(
        ErrorCodes.PLAN_IN_USE,
        'The default signup plan cannot be archived. Make another plan the default first.',
      );
    }
    plan.status = 'ARCHIVED';
    plan.isPublic = false;
    return plan.save();
  }

  /** How many organizations sit on each plan, keyed by plan code. */
  async subscriberCounts(): Promise<Record<string, number>> {
    const rows = await this.subscriptions.aggregate<{ _id: string; count: number }>([
      { $group: { _id: '$planCode', count: { $sum: 1 } } },
    ]);
    return Object.fromEntries(rows.map((row) => [row._id, row.count]));
  }
}

function isDuplicateKey(error: unknown): boolean {
  return Boolean(error) && (error as { code?: number }).code === 11000;
}
