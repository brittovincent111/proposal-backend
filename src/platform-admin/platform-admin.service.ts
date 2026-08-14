import { Injectable } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Connection, FilterQuery, Model, Types, isValidObjectId } from 'mongoose';

import { InvoicesService } from 'src/billing/invoices.service';
import { PlansService } from 'src/billing/plans.service';
import { SubscriptionsService, addDays } from 'src/billing/subscriptions.service';
import { SubscriptionDocument, SubscriptionStatus } from 'src/billing/subscription.schema';
import { monthlyEquivalent } from 'src/billing/plan.schema';
import { DomainException } from 'src/common/errors/domain.exception';
import { ErrorCodes } from 'src/common/errors/error-codes';
import {
  Organization,
  OrganizationDocument,
  OrganizationStatus,
} from 'src/organizations/organization.schema';
import { User, UserDocument } from 'src/users/user.schema';

export interface TenantRow {
  id: string;
  name: string;
  slug: string;
  status: OrganizationStatus;
  createdAt: string | null;
  planCode: string;
  planName: string;
  subscriptionStatus: SubscriptionStatus | 'NONE';
  interval: string;
  /** Minor units, normalised to a month so rows are comparable. */
  mrr: number;
  currency: string;
  renewsOn: string | null;
  members: number;
  quotations: number;
}

export interface SignupPoint {
  /** YYYY-MM */
  month: string;
  organizations: number;
}

@Injectable()
export class PlatformAdminService {
  constructor(
    @InjectModel(Organization.name)
    private readonly organizations: Model<OrganizationDocument>,
    @InjectModel(User.name) private readonly users: Model<UserDocument>,
    @InjectConnection() private readonly connection: Connection,
    private readonly subscriptions: SubscriptionsService,
    private readonly plans: PlansService,
    private readonly invoices: InvoicesService,
  ) {}

  // ------------------------------------------------------------------ metrics

  async metrics() {
    const now = new Date();
    const thirtyDaysAgo = addDays(now, -30);
    const sixtyDaysAgo = addDays(now, -60);

    const [
      totalOrganizations,
      activeOrganizations,
      suspendedOrganizations,
      newLast30,
      newPrevious30,
      totalUsers,
      mrr,
      statusRows,
      planRows,
      collected30,
      collectedAllTime,
      planList,
    ] = await Promise.all([
      this.organizations.countDocuments({}),
      this.organizations.countDocuments({ status: 'ACTIVE' }),
      this.organizations.countDocuments({ status: 'SUSPENDED' }),
      this.organizations.countDocuments({ createdAt: { $gte: thirtyDaysAgo } }),
      this.organizations.countDocuments({
        createdAt: { $gte: sixtyDaysAgo, $lt: thirtyDaysAgo },
      }),
      this.users.countDocuments({}),
      this.subscriptions.monthlyRecurringRevenue(),
      this.subscriptions.countByStatus(),
      this.subscriptions.countByPlan(),
      this.invoices.collectedSince(thirtyDaysAgo),
      this.invoices.collectedSince(new Date(0)),
      this.plans.listAll(),
    ]);

    const byStatus = Object.fromEntries(
      statusRows.map((row) => [row._id, row.count]),
    ) as Record<SubscriptionStatus, number>;

    const planNames = new Map(planList.map((plan) => [plan.code, plan.name]));
    const paying = (byStatus.ACTIVE ?? 0) + (byStatus.PAST_DUE ?? 0);

    return {
      organizations: {
        total: totalOrganizations,
        active: activeOrganizations,
        suspended: suspendedOrganizations,
        newLast30Days: newLast30,
        // Percentage change against the preceding 30 days. Null rather than
        // "+100%" when there is no prior period to compare against — a made-up
        // baseline reads as growth that never happened.
        growthPercent: newPrevious30 === 0 ? null : Math.round(((newLast30 - newPrevious30) / newPrevious30) * 100),
      },
      users: { total: totalUsers },
      revenue: {
        currency: 'INR',
        mrr,
        arr: mrr * 12,
        collectedLast30Days: collected30.INR ?? 0,
        collectedAllTime: collectedAllTime.INR ?? 0,
        // Average revenue per paying account, the usual sanity check on MRR.
        arpa: paying === 0 ? 0 : Math.round(mrr / paying),
      },
      subscriptions: {
        byStatus: {
          TRIALING: byStatus.TRIALING ?? 0,
          ACTIVE: byStatus.ACTIVE ?? 0,
          PAST_DUE: byStatus.PAST_DUE ?? 0,
          CANCELED: byStatus.CANCELED ?? 0,
          EXPIRED: byStatus.EXPIRED ?? 0,
        },
        paying,
      },
      planBreakdown: planRows.map((row) => ({
        planCode: row._id,
        planName: planNames.get(row._id) ?? row._id,
        subscribers: row.count,
        mrr: Math.round(row.mrr),
      })),
      signups: await this.signupsByMonth(12),
    };
  }

  /** Organization signups per month, oldest first, with empty months filled in. */
  private async signupsByMonth(months: number): Promise<SignupPoint[]> {
    const now = new Date();
    const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (months - 1), 1));

    const rows = await this.organizations.aggregate<{ _id: string; count: number }>([
      { $match: { createdAt: { $gte: from } } },
      { $group: { _id: { $dateToString: { format: '%Y-%m', date: '$createdAt' } }, count: { $sum: 1 } } },
    ]);

    const counts = new Map(rows.map((row) => [row._id, row.count]));

    // Months with no signups must still appear, or the chart silently compresses
    // a quiet quarter into a straight line between two busy ones.
    return Array.from({ length: months }, (_, index) => {
      const point = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + index, 1));
      const month = point.toISOString().slice(0, 7);
      return { month, organizations: counts.get(month) ?? 0 };
    });
  }

  // ------------------------------------------------------------------ tenants

  async listTenants(options: {
    search?: string;
    status?: OrganizationStatus;
    planCode?: string;
    limit?: number;
    skip?: number;
  }): Promise<{ rows: TenantRow[]; total: number }> {
    const limit = Math.min(options.limit ?? 50, 200);
    const skip = Math.max(options.skip ?? 0, 0);

    const filter: FilterQuery<OrganizationDocument> = {};
    if (options.status) filter.status = options.status;
    if (options.search?.trim()) {
      const escaped = escapeRegex(options.search.trim());
      filter.$or = [
        { name: { $regex: escaped, $options: 'i' } },
        { slug: { $regex: escaped, $options: 'i' } },
      ];
    }

    // A plan filter has to be resolved against subscriptions first, since the
    // plan lives on the subscription rather than the organization.
    if (options.planCode) {
      const scoped = await this.connection
        .collection('billing_subscriptions')
        .find({ planCode: options.planCode })
        .project({ organizationId: 1 })
        .toArray();
      filter._id = { $in: scoped.map((row) => row.organizationId as Types.ObjectId) };
    }

    const [organizations, total] = await Promise.all([
      this.organizations.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).exec(),
      this.organizations.countDocuments(filter),
    ]);

    const rows = await this.decorate(organizations);
    return { rows, total };
  }

  /**
   * Joins each organization to its subscription, plan and headline counts.
   *
   * Batched rather than per-row: a 200-tenant page would otherwise fire 800
   * queries.
   */
  private async decorate(organizations: OrganizationDocument[]): Promise<TenantRow[]> {
    if (!organizations.length) return [];

    const ids = organizations.map((organization) => organization._id);
    const [subscriptions, plans, memberCounts, quotationCounts] = await Promise.all([
      this.subscriptions.findManyByOrganization(ids),
      this.plans.listAll(),
      this.countBy('organization_members', ids),
      this.countBy('documents', ids),
    ]);

    const planNames = new Map(plans.map((plan) => [plan.code, plan.name]));
    const byOrg = new Map(
      subscriptions.map((subscription) => [subscription.organizationId.toString(), subscription]),
    );

    return organizations.map((organization) => {
      const id = organization._id.toString();
      const subscription = byOrg.get(id);
      return {
        id,
        name: organization.name,
        slug: organization.slug,
        status: organization.status,
        createdAt: toIso(organization.get('createdAt')),
        planCode: subscription?.planCode ?? '—',
        planName: subscription ? (planNames.get(subscription.planCode) ?? subscription.planCode) : '—',
        subscriptionStatus: subscription?.status ?? 'NONE',
        interval: subscription?.interval ?? '—',
        mrr: monthlyValue(subscription),
        currency: subscription?.currency ?? 'INR',
        renewsOn: subscription?.currentPeriodEnd?.toISOString() ?? null,
        members: memberCounts.get(id) ?? 0,
        quotations: quotationCounts.get(id) ?? 0,
      };
    });
  }

  private async countBy(
    collection: string,
    organizationIds: Types.ObjectId[],
  ): Promise<Map<string, number>> {
    const rows = await this.connection
      .collection(collection)
      .aggregate<{ _id: Types.ObjectId; count: number }>([
        { $match: { organizationId: { $in: organizationIds } } },
        { $group: { _id: '$organizationId', count: { $sum: 1 } } },
      ])
      .toArray();

    return new Map(rows.map((row) => [row._id.toString(), row.count]));
  }

  async tenantDetail(organizationId: string) {
    const organization = await this.findOrganization(organizationId);
    const [row] = await this.decorate([organization]);

    const [summary, invoices, members] = await Promise.all([
      this.subscriptions.summaryFor(organizationId),
      this.invoices.listForOrganization(organizationId, 20),
      this.listMembers(organizationId),
    ]);

    return { tenant: row, summary, invoices, members };
  }

  /** Owner/admin contacts for a tenant, so support knows who to talk to. */
  private async listMembers(organizationId: string) {
    const memberships = await this.connection
      .collection('organization_members')
      .find({ organizationId: new Types.ObjectId(organizationId) })
      .limit(50)
      .toArray();

    const userIds = memberships.map((member) => member.userId as Types.ObjectId);
    const users = await this.users
      .find({ _id: { $in: userIds } })
      .select({ email: 1, firstName: 1, lastName: 1, lastLoginAt: 1, status: 1 })
      .lean();

    const byId = new Map(users.map((user) => [user._id.toString(), user]));

    return memberships.map((member) => {
      const user = byId.get((member.userId as Types.ObjectId).toString());
      return {
        id: (member._id as Types.ObjectId).toString(),
        email: user?.email ?? '—',
        name: [user?.firstName, user?.lastName].filter(Boolean).join(' ').trim() || null,
        role: member.role as string,
        status: member.status as string,
        lastLoginAt: user?.lastLoginAt ? new Date(user.lastLoginAt).toISOString() : null,
      };
    });
  }

  async setTenantStatus(
    organizationId: string,
    status: OrganizationStatus,
  ): Promise<OrganizationDocument> {
    const organization = await this.findOrganization(organizationId);
    organization.status = status;
    return organization.save();
  }

  private async findOrganization(organizationId: string): Promise<OrganizationDocument> {
    if (!isValidObjectId(organizationId)) {
      throw DomainException.notFound(
        ErrorCodes.ORGANIZATION_NOT_FOUND,
        'That organization does not exist.',
      );
    }
    const organization = await this.organizations.findById(organizationId);
    if (!organization) {
      throw DomainException.notFound(
        ErrorCodes.ORGANIZATION_NOT_FOUND,
        'That organization does not exist.',
      );
    }
    return organization;
  }
}

function monthlyValue(subscription: SubscriptionDocument | undefined): number {
  if (!subscription) return 0;
  if (subscription.status !== 'ACTIVE' && subscription.status !== 'PAST_DUE') return 0;
  // Everything is billed yearly, so the monthly figure is a twelfth.
  return monthlyEquivalent(subscription.amount);
}

function toIso(value: unknown): string | null {
  return value instanceof Date ? value.toISOString() : null;
}

/** User-supplied search text goes into a $regex, so its metacharacters must go. */
function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
