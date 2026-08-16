import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, Model } from 'mongoose';

import { CreateLeadDto } from './dto/lead.dto';
import { Lead, LeadDocument } from './lead.schema';

export interface LeadRow {
  id: string;
  name: string;
  email: string;
  companyName: string;
  phone: string | null;
  teamSize: number | null;
  message: string | null;
  desiredPlanCode: string | null;
  source: string | null;
  createdAt: string | null;
}

interface LeadLike {
  _id: { toString(): string };
  name: string;
  email: string;
  companyName: string;
  phone?: string | null;
  teamSize?: number | null;
  message?: string | null;
  desiredPlanCode?: string | null;
  source?: string | null;
  createdAt?: Date | string | null;
}

function presentLead(lead: LeadLike): LeadRow {
  return {
    id: lead._id.toString(),
    name: lead.name,
    email: lead.email,
    companyName: lead.companyName,
    phone: lead.phone ?? null,
    teamSize: lead.teamSize ?? null,
    message: lead.message ?? null,
    desiredPlanCode: lead.desiredPlanCode ?? null,
    source: lead.source ?? null,
    createdAt: lead.createdAt ? new Date(lead.createdAt).toISOString() : null,
  };
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

@Injectable()
export class LeadsService {
  constructor(@InjectModel(Lead.name) private readonly leads: Model<LeadDocument>) {}

  async create(
    body: CreateLeadDto,
    context: { ipHash: string; userAgent: string },
  ): Promise<LeadRow> {
    const lead = await this.leads.create({
      name: body.name.trim(),
      email: body.email.trim().toLowerCase(),
      companyName: body.companyName.trim(),
      phone: body.phone?.trim() || null,
      teamSize: body.teamSize ?? null,
      message: body.message?.trim() || null,
      desiredPlanCode: body.desiredPlanCode?.trim() || null,
      source: body.source?.trim() || null,
      ipHash: context.ipHash,
      userAgent: context.userAgent,
    });

    return presentLead(lead);
  }

  async list(options: {
    search?: string;
    limit?: number;
    skip?: number;
  }): Promise<{ rows: LeadRow[]; total: number }> {
    const filter: FilterQuery<LeadDocument> = {};
    const search = options.search?.trim();
    if (search) {
      const escaped = escapeRegex(search);
      filter.$or = [
        { name: { $regex: escaped, $options: 'i' } },
        { email: { $regex: escaped, $options: 'i' } },
        { companyName: { $regex: escaped, $options: 'i' } },
      ];
    }

    const limit = Math.min(options.limit ?? 50, 200);
    const skip = Math.max(options.skip ?? 0, 0);

    const [rows, total] = await Promise.all([
      this.leads.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).exec(),
      this.leads.countDocuments(filter),
    ]);

    return { rows: rows.map(presentLead), total };
  }
}
