import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

/**
 * Every webhook we have already handled, keyed by the gateway's event id.
 *
 * Razorpay retries a delivery until it gets a 2xx, so the same "payment
 * captured" can arrive several times. Without this ledger a retry would extend
 * the billing period twice and issue a duplicate invoice. The unique index is
 * the actual guard — the insert either wins or throws E11000.
 */
@Schema({ collection: 'billing_webhook_events', timestamps: true })
export class WebhookEvent {
  @Prop({ type: String, required: true, unique: true })
  eventId!: string;

  @Prop({ type: String, required: true })
  provider!: string;

  @Prop({ type: String, required: true })
  eventType!: string;

  @Prop({ type: Date, default: () => new Date() })
  processedAt!: Date;
}

export type WebhookEventDocument = HydratedDocument<WebhookEvent>;
export const WebhookEventSchema = SchemaFactory.createForClass(WebhookEvent);

// eventId's unique index comes from `unique: true` on the prop above.
// Delivery ids stop being useful once the gateway gives up retrying; 30 days is
// far beyond Razorpay's retry window and keeps the collection from growing.
WebhookEventSchema.index({ processedAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 30 });
