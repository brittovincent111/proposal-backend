import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

import { GatewayProvider } from './subscription.schema';

export type InvoiceStatus = 'ISSUED' | 'PAID' | 'FAILED' | 'VOID';
export const InvoiceStatuses: InvoiceStatus[] = ['ISSUED', 'PAID', 'FAILED', 'VOID'];

@Schema({ _id: false })
export class InvoiceGatewayRefs {
  @Prop({ type: String, default: 'MANUAL', enum: ['RAZORPAY', 'MANUAL'] })
  provider!: GatewayProvider;

  @Prop({ type: String, default: null })
  invoiceId!: string | null;

  @Prop({ type: String, default: null })
  paymentId!: string | null;

  /** Gateway-hosted PDF. We do not render billing invoices ourselves. */
  @Prop({ type: String, default: null })
  hostedUrl!: string | null;
}

export const InvoiceGatewayRefsSchema = SchemaFactory.createForClass(InvoiceGatewayRefs);

/**
 * A billing invoice for the *platform's* charge to a tenant. Deliberately not
 * the same thing as a Quotation — that is the tenant's document to their own
 * customer, and the two must never share numbering or storage.
 */
@Schema({ collection: 'billing_invoices', timestamps: true })
export class Invoice {
  @Prop({ type: Types.ObjectId, required: true, index: true })
  organizationId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, default: null })
  subscriptionId!: Types.ObjectId | null;

  /** Platform-side sequence, e.g. QTN-INV-000142. */
  @Prop({ type: String, required: true, unique: true })
  number!: string;

  @Prop({ type: String, default: '' })
  planCode!: string;

  @Prop({ type: String, default: '' })
  description!: string;

  @Prop({ type: String, default: 'INR', uppercase: true })
  currency!: string;

  /** Minor units, as everywhere else. */
  @Prop({ type: Number, default: 0, min: 0 })
  subtotal!: number;

  @Prop({ type: Number, default: 0, min: 0 })
  tax!: number;

  @Prop({ type: Number, default: 0, min: 0 })
  total!: number;

  @Prop({ type: String, default: 'ISSUED', enum: InvoiceStatuses, index: true })
  status!: InvoiceStatus;

  @Prop({ type: Date, default: null })
  periodStart!: Date | null;

  @Prop({ type: Date, default: null })
  periodEnd!: Date | null;

  @Prop({ type: Date, default: () => new Date() })
  issuedAt!: Date;

  @Prop({ type: Date, default: null })
  paidAt!: Date | null;

  @Prop({ type: InvoiceGatewayRefsSchema, default: () => ({}) })
  gateway!: InvoiceGatewayRefs;
}

export type InvoiceDocument = HydratedDocument<Invoice>;
export const InvoiceSchema = SchemaFactory.createForClass(Invoice);

InvoiceSchema.index({ number: 1 }, { unique: true });
InvoiceSchema.index({ organizationId: 1, issuedAt: -1 });
InvoiceSchema.index({ 'gateway.invoiceId': 1 }, { sparse: true });
InvoiceSchema.index({ status: 1, paidAt: -1 });
