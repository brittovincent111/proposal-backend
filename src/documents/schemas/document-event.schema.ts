import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export const DocumentEventTypes = [
  'CREATED',
  'UPDATED',
  'GENERATED',
  'REVISION_CREATED',
  'APPROVAL_REQUESTED',
  'APPROVED',
  'SENT',
  'VIEWED',
  'CHANGE_REQUESTED',
  'ACCEPTED',
  'REJECTED',
  'EXPIRED',
  'CANCELLED',
  'SHARE_LINK_CREATED',
  'SHARE_LINK_REVOKED',
  'PDF_GENERATED',
] as const;
export type DocumentEventType = (typeof DocumentEventTypes)[number];

/** The document timeline — map.md §31. Append-only; nothing ever updates a row here. */
@Schema({ collection: 'document_events', timestamps: { createdAt: true, updatedAt: false } })
export class DocumentEvent {
  @Prop({ type: Types.ObjectId, required: true, index: true })
  organizationId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true, index: true })
  documentId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, default: null })
  revisionId!: Types.ObjectId | null;

  @Prop({ required: true, enum: DocumentEventTypes })
  eventType!: DocumentEventType;

  /** Null for customer-driven events arriving through the public link. */
  @Prop({ type: Types.ObjectId, default: null })
  actorUserId!: Types.ObjectId | null;

  /** Coarse public metadata only — hashed IP, user agent, never raw identifiers. */
  @Prop({ type: Object, default: {} })
  metadata!: Record<string, unknown>;
}

export type DocumentEventDocument = HydratedDocument<DocumentEvent>;
export const DocumentEventSchema = SchemaFactory.createForClass(DocumentEvent);

DocumentEventSchema.index({ documentId: 1, createdAt: -1 });
