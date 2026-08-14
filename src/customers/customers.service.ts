import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, Model, Types } from 'mongoose';

import { DomainException } from 'src/common/errors/domain.exception';
import { ErrorCodes } from 'src/common/errors/error-codes';
import { Page, escapeRegex, toPage } from 'src/common/dto/pagination.dto';
import { toObjectId } from 'src/common/utils/ids';
import { flattenPatch } from 'src/common/utils/patch';
import { CreateCustomerDto, CustomerQuery, UpdateCustomerDto } from './dto/customer.dto';
import { Customer, CustomerDocument } from './customer.schema';

@Injectable()
export class CustomersService {
  constructor(@InjectModel(Customer.name) private readonly customers: Model<CustomerDocument>) {}

  async list(organizationId: string, query: CustomerQuery): Promise<Page<CustomerDocument>> {
    const filter: FilterQuery<CustomerDocument> = {
      organizationId: new Types.ObjectId(organizationId),
    };
    if (!query.includeArchived) filter.archivedAt = null;
    if (query.type) filter.type = query.type;

    if (query.search) {
      const pattern = new RegExp(escapeRegex(query.search), 'i');
      filter.$or = [{ name: pattern }, { companyName: pattern }, { email: pattern }, { phone: pattern }];
    }

    const [data, total] = await Promise.all([
      this.customers
        .find(filter)
        .sort({ createdAt: query.order === 'asc' ? 1 : -1 })
        .skip(query.skip)
        .limit(query.limit)
        .lean<CustomerDocument[]>(),
      this.customers.countDocuments(filter),
    ]);

    return toPage(data, total, query);
  }

  async get(organizationId: string, id: string): Promise<CustomerDocument> {
    const customer = await this.customers.findOne({
      _id: toObjectId(id, ErrorCodes.CUSTOMER_NOT_FOUND, 'Customer'),
      organizationId: new Types.ObjectId(organizationId),
    });
    if (!customer) {
      throw DomainException.notFound(ErrorCodes.CUSTOMER_NOT_FOUND, 'Customer not found.');
    }
    return customer;
  }

  create(organizationId: string, createdById: string, dto: CreateCustomerDto) {
    return this.customers.create({
      ...dto,
      organizationId: new Types.ObjectId(organizationId),
      createdById: new Types.ObjectId(createdById),
    });
  }

  async update(organizationId: string, id: string, dto: UpdateCustomerDto) {
    const customer = await this.get(organizationId, id);
    // Documents hold their own customer snapshot, so this edit is safe: it
    // changes future documents only (map.md §70).
    customer.set(flattenPatch(dto as unknown as Record<string, unknown>));
    await customer.save();
    return customer;
  }

  /** Archive, never delete — historical documents keep pointing at this row (map.md §42). */
  async archive(organizationId: string, id: string) {
    const customer = await this.get(organizationId, id);
    customer.archivedAt = new Date();
    await customer.save();
    return customer;
  }

  async restore(organizationId: string, id: string) {
    const customer = await this.get(organizationId, id);
    customer.archivedAt = null;
    await customer.save();
    return customer;
  }
}
