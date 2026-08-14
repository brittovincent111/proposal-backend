import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

/**
 * Atomic sequence for platform-side billing invoice numbers.
 *
 * Counting existing invoices and adding one races: two webhooks landing in the
 * same millisecond would both compute the same number and one would lose to the
 * unique index. A `$inc` with upsert is a single atomic document update, so
 * every caller gets a distinct value with no retry loop.
 */
@Schema({ collection: 'billing_counters', timestamps: true })
export class BillingCounter {
  @Prop({ type: String, required: true, unique: true })
  key!: string;

  @Prop({ type: Number, default: 0 })
  value!: number;
}

export type BillingCounterDocument = HydratedDocument<BillingCounter>;
export const BillingCounterSchema = SchemaFactory.createForClass(BillingCounter);

BillingCounterSchema.index({ key: 1 }, { unique: true });
