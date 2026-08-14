import { Injectable } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection, Types } from 'mongoose';

import { DomainException } from 'src/common/errors/domain.exception';
import { ErrorCodes } from 'src/common/errors/error-codes';
import { PlanLimits, UNLIMITED } from './plan.schema';

export type LimitKey = 'seats' | 'quotationsPerMonth' | 'templates' | 'customers';

export interface UsageLine {
  key: LimitKey;
  label: string;
  used: number;
  /** -1 means unlimited. */
  limit: number;
  /** 0–100, clamped. Always 0 on an unlimited line so no bar is drawn full. */
  percent: number;
  exceeded: boolean;
}

export interface UsageReport {
  lines: UsageLine[];
  /** Reset boundary for the monthly quotation counter, as an ISO date. */
  quotaResetsOn: string;
}

const LABELS: Record<LimitKey, string> = {
  seats: 'Team members',
  quotationsPerMonth: 'Quotations this month',
  templates: 'Templates',
  customers: 'Customers',
};

/**
 * Counts what a tenant is using against what their plan allows.
 *
 * Reads the counted collections through the raw connection rather than by
 * injecting four other modules' models. Usage counting is a cross-cutting
 * read — importing DocumentsModule here would pull the rendering and template
 * engines into the billing module for a `countDocuments`.
 */
@Injectable()
export class EntitlementsService {
  constructor(@InjectConnection() private readonly connection: Connection) {}

  private count(collection: string, filter: Record<string, unknown>): Promise<number> {
    return this.connection.collection(collection).countDocuments(filter);
  }

  /** First instant of the current UTC month — the quotation quota boundary. */
  private static monthStart(now = new Date()): Date {
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  }

  private static monthEnd(now = new Date()): Date {
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  }

  async usageFor(organizationId: string, limits: PlanLimits): Promise<UsageReport> {
    const orgId = new Types.ObjectId(organizationId);
    const periodStart = EntitlementsService.monthStart();

    const [seats, quotations, templates, customers] = await Promise.all([
      this.count('organization_members', { organizationId: orgId, status: { $ne: 'SUSPENDED' } }),
      this.count('documents', { organizationId: orgId, createdAt: { $gte: periodStart } }),
      this.count('templates', { organizationId: orgId, status: { $ne: 'ARCHIVED' } }),
      this.count('customers', { organizationId: orgId }),
    ]);

    const used: Record<LimitKey, number> = {
      seats,
      quotationsPerMonth: quotations,
      templates,
      customers,
    };

    const lines = (Object.keys(LABELS) as LimitKey[]).map<UsageLine>((key) => {
      const limit = limits[key];
      const unlimited = limit === UNLIMITED;
      return {
        key,
        label: LABELS[key],
        used: used[key],
        limit,
        percent: unlimited || limit <= 0 ? 0 : Math.min(100, Math.round((used[key] / limit) * 100)),
        exceeded: !unlimited && used[key] > limit,
      };
    });

    return {
      lines,
      quotaResetsOn: EntitlementsService.monthEnd().toISOString().slice(0, 10),
    };
  }

  /** Current usage for one limit, without paying for the other three counts. */
  async usedFor(organizationId: string, key: LimitKey): Promise<number> {
    const orgId = new Types.ObjectId(organizationId);
    switch (key) {
      case 'seats':
        return this.count('organization_members', {
          organizationId: orgId,
          status: { $ne: 'SUSPENDED' },
        });
      case 'quotationsPerMonth':
        return this.count('documents', {
          organizationId: orgId,
          createdAt: { $gte: EntitlementsService.monthStart() },
        });
      case 'templates':
        return this.count('templates', { organizationId: orgId, status: { $ne: 'ARCHIVED' } });
      case 'customers':
        return this.count('customers', { organizationId: orgId });
    }
  }

  /**
   * Throws when creating one more of `key` would cross the plan ceiling.
   *
   * Compares `used >= limit` because the caller has not created its record yet —
   * a tenant at exactly the limit must be stopped, not allowed one over.
   */
  async assertWithinLimit(
    organizationId: string,
    limits: PlanLimits,
    key: LimitKey,
  ): Promise<void> {
    const limit = limits[key];
    if (limit === UNLIMITED) return;

    const used = await this.usedFor(organizationId, key);
    if (used >= limit) {
      throw new DomainException(
        ErrorCodes.PLAN_LIMIT_REACHED,
        `Your plan allows ${limit} ${LABELS[key].toLowerCase()}. Upgrade to add more.`,
        402,
      );
    }
  }
}
