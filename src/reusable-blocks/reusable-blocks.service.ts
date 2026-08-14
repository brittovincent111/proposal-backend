import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, Model, Types } from 'mongoose';
import { z } from 'zod';

import { Page, escapeRegex, toPage } from 'src/common/dto/pagination.dto';
import { DomainException } from 'src/common/errors/domain.exception';
import { ErrorCodes } from 'src/common/errors/error-codes';
import { toObjectId } from 'src/common/utils/ids';
import { blockSchema } from 'src/template-engine/template.contract';
import { formatZodError } from 'src/template-engine/template-schema.validator';
import { CreateReusableBlockDto, ReusableBlockQuery, UpdateReusableBlockDto } from './dto/reusable-block.dto';
import { ReusableBlock, ReusableBlockDocument } from './reusable-block.schema';

/** A saved block is one or more template blocks, stored in the template's own shape. */
const blockPayload = z.object({
  blocks: z.array(blockSchema).min(1).max(50),
});

@Injectable()
export class ReusableBlocksService {
  constructor(
    @InjectModel(ReusableBlock.name) private readonly blocks: Model<ReusableBlockDocument>,
  ) {}

  async list(organizationId: string, query: ReusableBlockQuery): Promise<Page<ReusableBlockDocument>> {
    const filter: FilterQuery<ReusableBlockDocument> = {
      organizationId: new Types.ObjectId(organizationId),
    };
    if (!query.includeArchived) filter.archivedAt = null;
    if (query.category) filter.category = query.category;
    if (query.tag) filter.tags = query.tag;
    if (query.search) {
      const pattern = new RegExp(escapeRegex(query.search), 'i');
      filter.$or = [{ name: pattern }, { description: pattern }, { tags: pattern }];
    }

    const [data, total] = await Promise.all([
      this.blocks
        .find(filter)
        .sort({ usageCount: -1, updatedAt: -1 })
        .skip(query.skip)
        .limit(query.limit)
        .lean<ReusableBlockDocument[]>(),
      this.blocks.countDocuments(filter),
    ]);

    return toPage(data, total, query);
  }

  async get(organizationId: string, id: string): Promise<ReusableBlockDocument> {
    const block = await this.blocks.findOne({
      _id: toObjectId(id, ErrorCodes.REUSABLE_BLOCK_NOT_FOUND, 'Block'),
      organizationId: new Types.ObjectId(organizationId),
    });
    if (!block) {
      throw DomainException.notFound(ErrorCodes.REUSABLE_BLOCK_NOT_FOUND, 'Block not found.');
    }
    return block;
  }

  create(organizationId: string, createdById: string, dto: CreateReusableBlockDto) {
    return this.blocks.create({
      ...dto,
      blockJson: this.parseBlockJson(dto.blockJson),
      organizationId: new Types.ObjectId(organizationId),
      createdById: new Types.ObjectId(createdById),
    });
  }

  async update(organizationId: string, id: string, dto: UpdateReusableBlockDto) {
    const block = await this.get(organizationId, id);
    const { blockJson, ...rest } = dto;
    block.set(rest);
    if (blockJson) block.blockJson = this.parseBlockJson(blockJson);
    await block.save();
    return block;
  }

  async duplicate(organizationId: string, id: string, createdById: string) {
    const source = await this.get(organizationId, id);
    const copy = source.toObject();
    delete (copy as { _id?: unknown })._id;

    return this.blocks.create({
      ...copy,
      name: `${source.name} (copy)`,
      status: 'DRAFT',
      usageCount: 0,
      archivedAt: null,
      createdById: new Types.ObjectId(createdById),
    });
  }

  async archive(organizationId: string, id: string) {
    const block = await this.get(organizationId, id);
    block.status = 'ARCHIVED';
    block.archivedAt = new Date();
    await block.save();
    return block;
  }

  private parseBlockJson(input: unknown): Record<string, unknown> {
    const result = blockPayload.safeParse(input);
    if (!result.success) {
      throw DomainException.invalid(
        ErrorCodes.TEMPLATE_SCHEMA_INVALID,
        'Invalid block content.',
        formatZodError(result.error),
      );
    }
    return result.data as unknown as Record<string, unknown>;
  }
}
