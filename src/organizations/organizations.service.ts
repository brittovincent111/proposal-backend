import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model, Types } from 'mongoose';

import { BusinessCategoriesService } from 'src/business-categories/business-categories.service';
import { TaxRate, TaxRateDocument } from 'src/catalog/tax-rate.schema';
import { DomainException } from 'src/common/errors/domain.exception';
import { ErrorCodes } from 'src/common/errors/error-codes';
import {
  OrganizationMember,
  OrganizationMemberDocument,
} from 'src/members/organization-member.schema';
import {
  OrganizationSettings,
  OrganizationSettingsDocument,
} from './organization-settings.schema';
import { Organization, OrganizationDocument } from './organization.schema';

/** GST slabs most Indian organizations start from; editable afterwards. */
const DEFAULT_TAX_RATES = [
  { name: 'GST 18%', percent: 18, split: true, isDefault: true },
  { name: 'GST 12%', percent: 12, split: true, isDefault: false },
  { name: 'GST 5%', percent: 5, split: true, isDefault: false },
  { name: 'No tax', percent: 0, split: false, isDefault: false },
];

@Injectable()
export class OrganizationsService {
  constructor(
    @InjectModel(Organization.name) private readonly organizations: Model<OrganizationDocument>,
    @InjectModel(OrganizationSettings.name)
    private readonly settings: Model<OrganizationSettingsDocument>,
    @InjectModel(OrganizationMember.name)
    private readonly members: Model<OrganizationMemberDocument>,
    @InjectModel(TaxRate.name) private readonly taxRates: Model<TaxRateDocument>,
    private readonly businessCategories: BusinessCategoriesService,
  ) {}

  /**
   * Creates an organization together with everything it cannot function without:
   * settings, an OWNER membership, and a starter tax table.
   *
   * Runs in a transaction when the deployment supports one (replica set); on a
   * standalone mongod it falls back to sequential writes, which is acceptable
   * because a half-provisioned org is only reachable by its single owner.
   */
  async provision(
    input: {
      name: string;
      ownerUserId: Types.ObjectId;
      ownerEmail: string;
      primaryBusinessCategoryId?: string;
    },
    session?: ClientSession,
  ): Promise<OrganizationDocument> {
    const slug = await this.uniqueSlug(input.name);
    const primaryBusinessCategoryId = await this.resolveBusinessCategoryId(
      input.primaryBusinessCategoryId,
    );

    const [organization] = await this.organizations.create(
      [{ name: input.name, slug, primaryBusinessCategoryId }],
      session ? { session } : undefined,
    );

    await this.settings.create(
      [
        {
          organizationId: organization._id,
          company: { name: input.name, email: input.ownerEmail },
        },
      ],
      session ? { session } : undefined,
    );

    await this.members.create(
      [
        {
          organizationId: organization._id,
          userId: input.ownerUserId,
          role: 'OWNER',
          status: 'ACTIVE',
          joinedAt: new Date(),
        },
      ],
      session ? { session } : undefined,
    );

    const created = await this.taxRates.create(
      DEFAULT_TAX_RATES.map((rate) => ({
        organizationId: organization._id,
        name: rate.name,
        percent: rate.percent,
        components: rate.split
          ? [
              { name: 'CGST', percent: rate.percent / 2 },
              { name: 'SGST', percent: rate.percent / 2 },
            ]
          : [],
        isDefault: rate.isDefault,
      })),
      session ? { session } : undefined,
    );

    const fallback = created.find((rate) => rate.isDefault);
    if (fallback) {
      await this.settings.updateOne(
        { organizationId: organization._id },
        { $set: { defaultTaxRateId: fallback._id } },
        session ? { session } : undefined,
      );
    }

    return organization;
  }

  async findById(organizationId: string): Promise<OrganizationDocument> {
    const organization = await this.organizations.findById(organizationId);
    if (!organization) {
      throw DomainException.notFound(ErrorCodes.ORGANIZATION_NOT_FOUND, 'Organization not found.');
    }
    return organization;
  }

  async update(
    organizationId: string,
    patch: Partial<
      Pick<
        Organization,
        'name' | 'logoUrl' | 'timezone' | 'defaultCurrency' | 'locale' | 'country'
      >
    > & {
      primaryBusinessCategoryId?: string;
    },
  ): Promise<OrganizationDocument> {
    const nextPatch: Record<string, unknown> = { ...patch };
    if (patch.primaryBusinessCategoryId !== undefined) {
      nextPatch.primaryBusinessCategoryId = await this.resolveBusinessCategoryId(
        patch.primaryBusinessCategoryId,
      );
    }

    const organization = await this.organizations.findByIdAndUpdate(
      organizationId,
      { $set: nextPatch },
      { new: true },
    );
    if (!organization) {
      throw DomainException.notFound(ErrorCodes.ORGANIZATION_NOT_FOUND, 'Organization not found.');
    }
    return organization;
  }

  async getSettings(organizationId: string): Promise<OrganizationSettingsDocument> {
    const settings = await this.settings.findOne({
      organizationId: new Types.ObjectId(organizationId),
    });
    if (!settings) {
      throw DomainException.notFound(
        ErrorCodes.ORGANIZATION_NOT_FOUND,
        'Organization settings not found.',
      );
    }
    return settings;
  }

  async updateSettings(
    organizationId: string,
    patch: Record<string, unknown>,
  ): Promise<OrganizationSettingsDocument> {
    const settings = await this.settings.findOneAndUpdate(
      { organizationId: new Types.ObjectId(organizationId) },
      { $set: patch },
      { new: true },
    );
    if (!settings) {
      throw DomainException.notFound(
        ErrorCodes.ORGANIZATION_NOT_FOUND,
        'Organization settings not found.',
      );
    }
    return settings;
  }

  private async uniqueSlug(name: string): Promise<string> {
    const base =
      name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 40) || 'org';

    let candidate = base;
    let suffix = 2;
    // Bounded: the unique index is the real guard, this only picks a pretty slug.
    while (await this.organizations.exists({ slug: candidate })) {
      candidate = `${base}-${suffix}`;
      suffix += 1;
      if (suffix > 50) return `${base}-${Date.now().toString(36)}`;
    }
    return candidate;
  }

  private async resolveBusinessCategoryId(
    value: string | undefined,
  ): Promise<Types.ObjectId | null> {
    if (!value) return null;
    const category = await this.businessCategories.require(value);
    return category._id;
  }
}
