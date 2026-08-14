import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';

import { BillingCounter, BillingCounterDocument } from './counter.schema';
import { Invoice, InvoiceDocument, InvoiceStatus } from './invoice.schema';
import { GatewayProvider } from './subscription.schema';

const INVOICE_COUNTER_KEY = 'billing-invoice';

export interface RecordInvoiceInput {
  organizationId: Types.ObjectId;
  subscriptionId: Types.ObjectId | null;
  planCode: string;
  description: string;
  currency: string;
  total: number;
  status: InvoiceStatus;
  periodStart: Date | null;
  periodEnd: Date | null;
  paidAt: Date | null;
  provider: GatewayProvider;
  gatewayInvoiceId?: string | null;
  gatewayPaymentId?: string | null;
  hostedUrl?: string | null;
}

@Injectable()
export class InvoicesService {
  constructor(
    @InjectModel(Invoice.name) private readonly invoices: Model<InvoiceDocument>,
    @InjectModel(BillingCounter.name)
    private readonly counters: Model<BillingCounterDocument>,
  ) {}

  private async nextNumber(): Promise<string> {
    const counter = await this.counters.findOneAndUpdate(
      { key: INVOICE_COUNTER_KEY },
      { $inc: { value: 1 } },
      { upsert: true, new: true },
    );
    return `QTN-INV-${String(counter?.value ?? 1).padStart(6, '0')}`;
  }

  /**
   * Writes an invoice for a gateway charge, or returns the one already written.
   *
   * Keyed on the gateway invoice id: Razorpay redelivers `invoice.paid` until it
   * sees a 2xx, and a second row would double every revenue figure in /admin.
   */
  async record(input: RecordInvoiceInput): Promise<InvoiceDocument> {
    if (input.gatewayInvoiceId) {
      const existing = await this.invoices.findOne({
        'gateway.invoiceId': input.gatewayInvoiceId,
      });
      if (existing) {
        // A `payment.failed` may arrive before the `invoice.paid` for the same
        // invoice, so a later status still has to be able to move it forward.
        if (existing.status !== input.status) {
          existing.status = input.status;
          existing.paidAt = input.paidAt;
          await existing.save();
        }
        return existing;
      }
    }

    return this.invoices.create({
      organizationId: input.organizationId,
      subscriptionId: input.subscriptionId,
      number: await this.nextNumber(),
      planCode: input.planCode,
      description: input.description,
      currency: input.currency,
      // Gateway amounts are tax-inclusive; we do not re-derive a split we were
      // not told, so subtotal carries the whole figure and tax stays zero.
      subtotal: input.total,
      tax: 0,
      total: input.total,
      status: input.status,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      issuedAt: new Date(),
      paidAt: input.paidAt,
      gateway: {
        provider: input.provider,
        invoiceId: input.gatewayInvoiceId ?? null,
        paymentId: input.gatewayPaymentId ?? null,
        hostedUrl: input.hostedUrl ?? null,
      },
    });
  }

  listForOrganization(organizationId: string, limit = 50): Promise<InvoiceDocument[]> {
    return this.invoices
      .find({ organizationId: new Types.ObjectId(organizationId) })
      .sort({ issuedAt: -1 })
      .limit(limit)
      .exec();
  }

  listRecent(limit = 25): Promise<InvoiceDocument[]> {
    return this.invoices.find().sort({ issuedAt: -1 }).limit(limit).exec();
  }

  /** Total collected since `since`, in minor units, split by currency. */
  async collectedSince(since: Date): Promise<Record<string, number>> {
    const rows = await this.invoices.aggregate<{ _id: string; total: number }>([
      { $match: { status: 'PAID', paidAt: { $gte: since } } },
      { $group: { _id: '$currency', total: { $sum: '$total' } } },
    ]);
    return Object.fromEntries(rows.map((row) => [row._id, row.total]));
  }
}
