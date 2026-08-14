import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

/**
 * An immutable historical snapshot — map.md §26.
 *
 * Once `sentAt` is set nothing here may change; a customer request produces the
 * next revision instead. Everything needed to re-render the document offline is
 * inside `resolvedDocumentJson`, so no live template, package or customer read
 * is required (and none is permitted).
 */
@Schema({ collection: 'document_revisions', timestamps: true })
export class DocumentRevision {
  @Prop({ type: Types.ObjectId, required: true, index: true })
  documentId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true, index: true })
  organizationId!: Types.ObjectId;

  @Prop({ required: true, min: 1 })
  revisionNumber!: number;

  @Prop({ type: Types.ObjectId, default: null })
  templateVersionId!: Types.ObjectId | null;

  @Prop({ type: Object, default: {} })
  inputValuesJson!: Record<string, unknown>;

  @Prop({ type: Object, required: true })
  resolvedDocumentJson!: Record<string, unknown>;

  @Prop({ type: Object, required: true })
  pricingSnapshotJson!: Record<string, unknown>;

  @Prop({ type: Object, default: {} })
  styleSnapshotJson!: Record<string, unknown>;

  /** Human-readable diff against the previous revision — map.md §27. */
  @Prop({ type: Object, default: {} })
  changeSummaryJson!: Record<string, unknown>;

  // Denormalised totals (minor units) so list screens never load the snapshot.
  @Prop({ default: 0 }) subtotal!: number;
  @Prop({ default: 0 }) discountTotal!: number;
  @Prop({ default: 0 }) taxTotal!: number;
  @Prop({ default: 0 }) grandTotal!: number;

  @Prop({ type: String, default: null })
  pdfAssetId!: string | null;

  @Prop({ type: Types.ObjectId, default: null })
  createdById!: Types.ObjectId | null;

  /** Set the moment the revision is shared; from then on it is frozen. */
  @Prop({ type: Date, default: null })
  sentAt!: Date | null;
}

export type DocumentRevisionDocument = HydratedDocument<DocumentRevision>;
export const DocumentRevisionSchema = SchemaFactory.createForClass(DocumentRevision);

DocumentRevisionSchema.index({ documentId: 1, revisionNumber: 1 }, { unique: true });
