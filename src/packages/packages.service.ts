import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, Model, Types } from 'mongoose';

import { Page, escapeRegex, toPage } from 'src/common/dto/pagination.dto';
import { DomainException } from 'src/common/errors/domain.exception';
import { ErrorCodes } from 'src/common/errors/error-codes';
import { nextLocalId, toObjectId } from 'src/common/utils/ids';
import { CreatePackageDto, PackageQuery, UpdatePackageDto } from './dto/package.dto';
import { Package, PackageDocument } from './package.schema';

@Injectable()
export class PackagesService {
  constructor(@InjectModel(Package.name) private readonly packages: Model<PackageDocument>) {}

  async list(organizationId: string, query: PackageQuery): Promise<Page<PackageDocument>> {
    const filter: FilterQuery<PackageDocument> = {
      organizationId: new Types.ObjectId(organizationId),
    };
    if (!query.includeArchived) filter.archivedAt = null;
    if (query.status) filter.status = query.status;
    if (query.category) filter.category = query.category;
    if (query.search) {
      const pattern = new RegExp(escapeRegex(query.search), 'i');
      filter.$or = [{ name: pattern }, { description: pattern }, { category: pattern }];
    }

    const [data, total] = await Promise.all([
      this.packages
        .find(filter)
        .sort({ usageCount: -1, updatedAt: -1 })
        .skip(query.skip)
        .limit(query.limit)
        .lean<PackageDocument[]>(),
      this.packages.countDocuments(filter),
    ]);

    return toPage(data, total, query);
  }

  async get(organizationId: string, id: string): Promise<PackageDocument> {
    const entry = await this.packages.findOne({
      _id: toObjectId(id, ErrorCodes.PACKAGE_NOT_FOUND, 'Package'),
      organizationId: new Types.ObjectId(organizationId),
    });
    if (!entry) throw DomainException.notFound(ErrorCodes.PACKAGE_NOT_FOUND, 'Package not found.');
    return entry;
  }

  create(organizationId: string, createdById: string, dto: CreatePackageDto) {
    return this.packages.create({
      ...dto,
      lines: this.normaliseLines(dto.lines),
      organizationId: new Types.ObjectId(organizationId),
      createdById: new Types.ObjectId(createdById),
    });
  }

  /**
   * Edits the live package.
   *
   * Documents that already quoted it are untouched — they carry a full line
   * snapshot (map.md §72), so `version` here is informational only.
   */
  async update(organizationId: string, id: string, dto: UpdatePackageDto) {
    const entry = await this.get(organizationId, id);
    const { lines, ...rest } = dto;
    entry.set(rest);
    if (lines) entry.lines = this.normaliseLines(lines);
    entry.version += 1;
    await entry.save();
    return entry;
  }

  async duplicate(organizationId: string, id: string, createdById: string) {
    const source = await this.get(organizationId, id);
    const copy = source.toObject();
    delete (copy as { _id?: unknown })._id;

    return this.packages.create({
      ...copy,
      name: `${source.name} (copy)`,
      status: 'DRAFT',
      version: 1,
      usageCount: 0,
      archivedAt: null,
      createdById: new Types.ObjectId(createdById),
      lines: source.lines.map((line) => ({ ...line, lineId: nextLocalId('pln') })),
    });
  }

  async publish(organizationId: string, id: string) {
    const entry = await this.get(organizationId, id);
    if (entry.lines.length === 0 && entry.pricingMode !== 'FIXED_PRICE') {
      throw DomainException.invalid(
        ErrorCodes.VALIDATION_FAILED,
        'Add at least one line before publishing this package.',
      );
    }
    entry.status = 'PUBLISHED';
    await entry.save();
    return entry;
  }

  async archive(organizationId: string, id: string) {
    const entry = await this.get(organizationId, id);
    entry.status = 'ARCHIVED';
    entry.archivedAt = new Date();
    await entry.save();
    return entry;
  }

  async recordUsage(organizationId: string, packageIds: Types.ObjectId[]): Promise<void> {
    if (!packageIds.length) return;
    await this.packages.updateMany(
      { organizationId: new Types.ObjectId(organizationId), _id: { $in: packageIds } },
      { $inc: { usageCount: 1 } },
    );
  }

  private normaliseLines(lines: CreatePackageDto['lines']) {
    return (lines ?? []).map((line) => ({
      lineId: line.lineId ?? nextLocalId('pln'),
      itemId: line.itemId ? new Types.ObjectId(line.itemId) : null,
      name: line.name,
      description: line.description ?? '',
      unit: line.unit ?? 'nos',
      quantity: line.quantity ?? 1,
      rate: line.rate ?? 0,
      taxRateId: line.taxRateId ? new Types.ObjectId(line.taxRateId) : null,
      optional: line.optional ?? false,
    }));
  }
}
