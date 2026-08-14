import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';

import { DomainException } from 'src/common/errors/domain.exception';
import { ErrorCodes } from 'src/common/errors/error-codes';
import { toObjectId } from 'src/common/utils/ids';
import {
  BusinessCategory,
  BusinessCategoryDocument,
} from './business-category.schema';

const DEFAULT_BUSINESS_CATEGORIES = [
  {
    slug: 'general-business',
    name: 'General Business',
    description: 'Flexible, cross-industry templates with no domain-specific assumptions.',
    starterIds: ['blank'],
    sortOrder: 10,
  },
  {
    slug: 'tourism',
    name: 'Tourism',
    description: 'Tour operators, travel planners, destination management companies, and holiday packaging teams.',
    starterIds: ['travel', 'blank'],
    sortOrder: 20,
  },
  {
    slug: 'wedding-planner',
    name: 'Wedding Planner',
    description: 'Wedding planners and marriage-event proposal workflows with add-ons and guest-driven pricing.',
    starterIds: ['event', 'blank'],
    sortOrder: 30,
  },
  {
    slug: 'event-management',
    name: 'Event Management',
    description: 'General event agencies handling stage, catering, AV, and production packages.',
    starterIds: ['event', 'blank'],
    sortOrder: 40,
  },
  {
    slug: 'interior-design',
    name: 'Interior Design',
    description: 'Interior designers and modular furnishing teams working from measurements and rate cards.',
    starterIds: ['interior', 'blank'],
    sortOrder: 50,
  },
];

@Injectable()
export class BusinessCategoriesService {
  private ensureDefaultsTask: Promise<void> | null = null;

  constructor(
    @InjectModel(BusinessCategory.name)
    private readonly categories: Model<BusinessCategoryDocument>,
  ) {}

  async list() {
    await this.ensureDefaults();
    return this.categories.find({ archivedAt: null }).sort({ sortOrder: 1, name: 1 }).lean();
  }

  async require(id: string) {
    await this.ensureDefaults();
    const category = await this.categories.findOne({
      _id: toObjectId(id, ErrorCodes.BUSINESS_CATEGORY_NOT_FOUND, 'Business category'),
      archivedAt: null,
    });
    if (!category) {
      throw DomainException.notFound(
        ErrorCodes.BUSINESS_CATEGORY_NOT_FOUND,
        'Business category not found.',
      );
    }
    return category;
  }

  async mapByIds(ids: Array<string | Types.ObjectId | null | undefined>) {
    await this.ensureDefaults();

    const normalized = [...new Set(ids.filter(Boolean).map((id) => id!.toString()))];
    if (!normalized.length) return new Map<string, Record<string, unknown>>();

    const categories = await this.categories
      .find({
        _id: { $in: normalized.map((id) => new Types.ObjectId(id)) },
        archivedAt: null,
      })
      .lean();

    return new Map(
      categories.map((category) => [category._id.toString(), this.summary(category)]),
    );
  }

  summary(category: {
    _id: Types.ObjectId | { toString(): string };
    name: string;
    slug: string;
    starterIds?: string[];
  }) {
    return {
      id: category._id.toString(),
      name: category.name,
      slug: category.slug,
      starterIds: category.starterIds ?? [],
    };
  }

  private ensureDefaults() {
    if (this.ensureDefaultsTask) return this.ensureDefaultsTask;

    this.ensureDefaultsTask = this.categories
      .bulkWrite(
        DEFAULT_BUSINESS_CATEGORIES.map((category) => ({
          updateOne: {
            filter: { slug: category.slug },
            update: {
              $setOnInsert: category,
            },
            upsert: true,
          },
        })),
        { ordered: false },
      )
      .then(() => undefined)
      .finally(() => {
        this.ensureDefaultsTask = null;
      });

    return this.ensureDefaultsTask;
  }
}
