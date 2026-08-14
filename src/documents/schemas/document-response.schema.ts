import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

/**
 * map.md §32 — the acceptance is pinned to the exact revision the customer saw.
 * Accepting revision 2 must never imply acceptance of a later revision 3.
 */
@Schema({ collection: 'document_acceptances', timestamps: true })
export class DocumentAcceptance {
  @Prop({ type: Types.ObjectId, required: true, index: true })
  organizationId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true, index: true })
  documentId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true })
  revisionId!: Types.ObjectId;

  @Prop({ required: true })
  revisionNumber!: number;

  @Prop({ required: true })
  customerName!: string;

  @Prop({ default: '' })
  customerEmail!: string;

  @Prop({ default: '' })
  customerComment!: string;

  @Prop({ required: true })
  acceptedAt!: Date;

  /** Hashed, not raw — enough to evidence the acceptance without storing an identifier. */
  @Prop({ default: '' })
  ipHash!: string;

  @Prop({ default: '' })
  userAgent!: string;
}

export type DocumentAcceptanceDocument = HydratedDocument<DocumentAcceptance>;
export const DocumentAcceptanceSchema = SchemaFactory.createForClass(DocumentAcceptance);

/** map.md §33 — a customer asking for changes, always against a specific revision. */
@Schema({ collection: 'document_change_requests', timestamps: true })
export class DocumentChangeRequest {
  @Prop({ type: Types.ObjectId, required: true, index: true })
  organizationId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true, index: true })
  documentId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true })
  revisionId!: Types.ObjectId;

  @Prop({ required: true })
  revisionNumber!: number;

  @Prop({ required: true })
  message!: string;

  @Prop({ default: '' })
  customerName!: string;

  @Prop({ type: String, default: 'OPEN', enum: ['OPEN', 'RESOLVED'] })
  status!: 'OPEN' | 'RESOLVED';

  @Prop({ type: Date, default: null })
  resolvedAt!: Date | null;

  @Prop({ default: '' })
  ipHash!: string;
}

export type DocumentChangeRequestDocument = HydratedDocument<DocumentChangeRequest>;
export const DocumentChangeRequestSchema = SchemaFactory.createForClass(DocumentChangeRequest);
