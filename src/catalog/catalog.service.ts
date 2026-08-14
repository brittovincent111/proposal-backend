import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, Model, Types } from 'mongoose';

import { Page, escapeRegex, toPage } from 'src/common/dto/pagination.dto';
import { DomainException } from 'src/common/errors/domain.exception';
import { ErrorCodes } from 'src/common/errors/error-codes';
import { toObjectId } from 'src/common/utils/ids';
import { TaxRateSnapshot } from 'src/template-engine/pricing.types';
import { CreateItemDto, CreateTaxRateDto, ItemQuery, UpdateItemDto, UpdateTaxRateDto } from './dto/catalog.dto';
import { Item, ItemDocument } from './item.schema';
import { TaxRate, TaxRateDocument } from './tax-rate.schema';

@Injectable()
export class CatalogService {
  constructor(
    @InjectModel(Item.name) private readonly items: Model<ItemDocument>,
    @InjectModel(TaxRate.name) private readonly taxRates: Model<TaxRateDocument>,
  ) {}

  /* ------------------------------------------------------------------ items */

  async listItems(organizationId: string, query: ItemQuery): Promise<Page<ItemDocument>> {
    const filter: FilterQuery<ItemDocument> = {
      organizationId: new Types.ObjectId(organizationId),
    };
    if (!query.includeArchived) filter.archivedAt = null;
    if (query.type) filter.type = query.type;
    if (query.category) filter.category = query.category;
    if (query.search) {
      const pattern = new RegExp(escapeRegex(query.search), 'i');
      filter.$or = [{ name: pattern }, { description: pattern }, { category: pattern }];
    }

    const [data, total] = await Promise.all([
      this.items
        // Most-used first is what makes the item picker feel like it learns.
        .find(filter)
        .sort({ usageCount: -1, name: 1 })
        .skip(query.skip)
        .limit(query.limit)
        .lean<ItemDocument[]>(),
      this.items.countDocuments(filter),
    ]);

    return toPage(data, total, query);
  }

  async getItem(organizationId: string, id: string): Promise<ItemDocument> {
    const item = await this.items.findOne({
      _id: toObjectId(id, ErrorCodes.ITEM_NOT_FOUND, 'Item'),
      organizationId: new Types.ObjectId(organizationId),
    });
    if (!item) throw DomainException.notFound(ErrorCodes.ITEM_NOT_FOUND, 'Item not found.');
    return item;
  }

  async createItem(organizationId: string, createdById: string, dto: CreateItemDto) {
    return this.items.create({
      ...dto,
      taxRateId: dto.taxRateId ? new Types.ObjectId(dto.taxRateId) : null,
      organizationId: new Types.ObjectId(organizationId),
      createdById: new Types.ObjectId(createdById),
    });
  }

  async updateItem(organizationId: string, id: string, dto: UpdateItemDto) {
    const item = await this.getItem(organizationId, id);
    const { taxRateId, ...rest } = dto;
    item.set(rest);
    if (taxRateId !== undefined) {
      item.taxRateId = taxRateId ? new Types.ObjectId(taxRateId) : null;
    }
    await item.save();
    return item;
  }

  async archiveItem(organizationId: string, id: string) {
    const item = await this.getItem(organizationId, id);
    item.archivedAt = new Date();
    await item.save();
    return item;
  }

  /** Called when a document is sent — drives "most used" ordering (map.md §16). */
  async recordItemUsage(organizationId: string, itemIds: Types.ObjectId[]): Promise<void> {
    if (!itemIds.length) return;
    await this.items.updateMany(
      { organizationId: new Types.ObjectId(organizationId), _id: { $in: itemIds } },
      { $inc: { usageCount: 1 } },
    );
  }

  /* -------------------------------------------------------------- tax rates */

  listTaxRates(organizationId: string) {
    return this.taxRates
      .find({ organizationId: new Types.ObjectId(organizationId), archivedAt: null })
      .sort({ percent: -1 })
      .lean();
  }

  /** The shape the pricing calculator consumes. */
  async taxSnapshots(organizationId: string): Promise<TaxRateSnapshot[]> {
    const rates = await this.listTaxRates(organizationId);
    return rates.map((rate) => ({
      id: rate._id.toString(),
      name: rate.name,
      percent: rate.percent,
      components: rate.components.map((component) => ({
        name: component.name,
        percent: component.percent,
      })),
    }));
  }

  async createTaxRate(organizationId: string, dto: CreateTaxRateDto) {
    const created = await this.taxRates.create({
      ...dto,
      organizationId: new Types.ObjectId(organizationId),
    });
    if (created.isDefault) await this.clearOtherDefaults(organizationId, created._id);
    return created;
  }

  async updateTaxRate(organizationId: string, id: string, dto: UpdateTaxRateDto) {
    const rate = await this.taxRates.findOne({
      _id: toObjectId(id, ErrorCodes.TAX_RATE_NOT_FOUND, 'Tax rate'),
      organizationId: new Types.ObjectId(organizationId),
    });
    if (!rate) throw DomainException.notFound(ErrorCodes.TAX_RATE_NOT_FOUND, 'Tax rate not found.');

    rate.set(dto);
    await rate.save();
    if (rate.isDefault) await this.clearOtherDefaults(organizationId, rate._id);
    return rate;
  }

  private async clearOtherDefaults(organizationId: string, keep: Types.ObjectId) {
    await this.taxRates.updateMany(
      { organizationId: new Types.ObjectId(organizationId), _id: { $ne: keep } },
      { $set: { isDefault: false } },
    );
  }
}
