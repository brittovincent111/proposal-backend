import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export const DocumentStatuses = [
  'DRAFT',
  'PENDING_APPROVAL',
  'APPROVED',
  'SENT',
  'VIEWED',
  'CHANGE_REQUESTED',
  'ACCEPTED',
  'REJECTED',
  'EXPIRED',
  'CANCELLED',
] as const;
export type DocumentStatus = (typeof DocumentStatuses)[number];

/** Frozen copy of the buyer — map.md §70. A later customer edit must not alter history. */
@Schema({ _id: false })
export class CustomerSnapshot {
  @Prop({ type: Types.ObjectId, default: null }) customerId!: Types.ObjectId | null;
  @Prop({ default: '' }) name!: string;
  @Prop({ default: '' }) companyName!: string;
  @Prop({ default: '' }) email!: string;
  @Prop({ default: '' }) phone!: string;
  @Prop({ default: '' }) taxId!: string;
  @Prop({ default: '' }) billingAddress!: string;
}
export const CustomerSnapshotSchema = SchemaFactory.createForClass(CustomerSnapshot);

/** Frozen copy of the seller's branding — map.md §71. */
@Schema({ _id: false })
export class CompanySnapshot {
  @Prop({ default: '' }) name!: string;
  @Prop({ default: '' }) address!: string;
  @Prop({ default: '' }) phone!: string;
  @Prop({ default: '' }) email!: string;
  @Prop({ default: '' }) website!: string;
  @Prop({ default: '' }) taxNumber!: string;
  @Prop({ default: '' }) bankDetails!: string;
  @Prop({ type: String, default: null }) logoUrl!: string | null;
  @Prop({ default: '#2563eb' }) accentColor!: string;
  @Prop({ default: '' }) footerNote!: string;
}
export const CompanySnapshotSchema = SchemaFactory.createForClass(CompanySnapshot);

/** The share link. Only the hash is stored — map.md §34. */
@Schema({ _id: false })
export class ShareLink {
  @Prop({ type: String, default: null, index: true, sparse: true }) tokenHash!: string | null;
  @Prop({ type: Date, default: null }) expiresAt!: Date | null;
  @Prop({ type: Date, default: null }) revokedAt!: Date | null;
  @Prop({ type: Date, default: null }) createdAt!: Date | null;
  @Prop({ default: 0 }) viewCount!: number;
  @Prop({ type: Date, default: null }) lastViewedAt!: Date | null;
}
export const ShareLinkSchema = SchemaFactory.createForClass(ShareLink);

@Schema({ _id: false })
export class PackageSnapshotDay {
  @Prop({ required: true, min: 1 }) day!: number;
  @Prop({ default: '' }) title!: string;
  @Prop({ default: '' }) summary!: string;
  @Prop({ type: [String], default: [] }) highlights!: string[];
  @Prop({ type: [String], default: [] }) images!: string[];
}
export const PackageSnapshotDaySchema = SchemaFactory.createForClass(PackageSnapshotDay);

@Schema({ _id: false })
export class PackageSnapshot {
  @Prop({ type: String, required: true }) packageId!: string;
  @Prop({ default: '' }) name!: string;
  @Prop({ default: '' }) description!: string;
  @Prop({ type: [PackageSnapshotDaySchema], default: [] }) itinerary!: PackageSnapshotDay[];
  @Prop({ type: [String], default: [] }) inclusions!: string[];
  @Prop({ type: [String], default: [] }) exclusions!: string[];
  @Prop({ type: [String], default: [] }) lineIds!: string[];
}
export const PackageSnapshotSchema = SchemaFactory.createForClass(PackageSnapshot);

/**
 * The editable working state of a document.
 *
 * Everything here is what the operator is currently changing; generating pushes
 * a frozen copy into a DocumentRevision. Sending never reads this again.
 */
@Schema({ _id: false })
export class DocumentDraft {
  @Prop({ type: Object, default: {} }) answers!: Record<string, unknown>;
  @Prop({ type: [Object], default: [] }) sections!: Record<string, unknown>[];
  @Prop({ type: [PackageSnapshotSchema], default: [] }) packageSnapshots!: PackageSnapshot[];
  @Prop({ type: Object, default: () => ({ mode: 'PERCENT', value: 0 }) })
  overallDiscount!: Record<string, unknown>;
  @Prop({ type: [Object], default: [] }) charges!: Record<string, unknown>[];
  @Prop({ default: false }) taxInclusive!: boolean;
  @Prop({ default: true }) roundOff!: boolean;
  @Prop({ default: '' }) customerNotes!: string;
  @Prop({ default: '' }) terms!: string;
  @Prop({ default: '' }) paymentTerms!: string;
  /** Never leaves the organization — excluded from every public payload (map.md §34). */
  @Prop({ default: '' }) internalNotes!: string;
}
export const DocumentDraftSchema = SchemaFactory.createForClass(DocumentDraft);

@Schema({ collection: 'documents', timestamps: true, optimisticConcurrency: true })
export class ProposalDocument {
  @Prop({ type: Types.ObjectId, required: true, index: true })
  organizationId!: Types.ObjectId;

  @Prop({ required: true })
  documentNumber!: string;

  @Prop({ default: '' })
  title!: string;

  @Prop({ default: '' })
  reference!: string;

  @Prop({ type: Types.ObjectId, default: null })
  customerId!: Types.ObjectId | null;

  @Prop({ type: CustomerSnapshotSchema, default: () => ({}) })
  customerSnapshot!: CustomerSnapshot;

  @Prop({ type: CompanySnapshotSchema, default: () => ({}) })
  companySnapshot!: CompanySnapshot;

  @Prop({ type: Types.ObjectId, default: null })
  templateId!: Types.ObjectId | null;

  /** Pinned at creation: the exact version this document was built from (map.md §29). */
  @Prop({ type: Types.ObjectId, default: null })
  templateVersionId!: Types.ObjectId | null;

  @Prop({ default: '' })
  templateName!: string;

  @Prop({ type: String, default: 'DRAFT', enum: DocumentStatuses, index: true })
  status!: DocumentStatus;

  @Prop({ default: 'INR' })
  currency!: string;

  @Prop({ default: 'en-IN' })
  locale!: string;

  @Prop({ required: true })
  validFrom!: Date;

  @Prop({ required: true })
  validUntil!: Date;

  @Prop({ type: DocumentDraftSchema, default: () => ({}) })
  draft!: DocumentDraft;

  /** Totals of the *draft*; a revision carries its own frozen copy. */
  @Prop({ type: Object, default: {} })
  draftTotals!: Record<string, unknown>;

  @Prop({ type: Types.ObjectId, default: null })
  currentRevisionId!: Types.ObjectId | null;

  @Prop({ default: 0, min: 0 })
  currentRevisionNumber!: number;

  /** Set when a customer accepts, so a later revision cannot inherit the acceptance. */
  @Prop({ type: Types.ObjectId, default: null })
  acceptedRevisionId!: Types.ObjectId | null;

  @Prop({ type: ShareLinkSchema, default: () => ({}) })
  share!: ShareLink;

  @Prop({ type: Types.ObjectId, required: true })
  createdById!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, default: null })
  assignedToId!: Types.ObjectId | null;

  @Prop({ type: Date, default: null }) sentAt!: Date | null;
  @Prop({ type: Date, default: null }) viewedAt!: Date | null;
  @Prop({ type: Date, default: null }) acceptedAt!: Date | null;
  @Prop({ type: Date, default: null }) approvedAt!: Date | null;
  @Prop({ type: Types.ObjectId, default: null }) approvedById!: Types.ObjectId | null;
  @Prop({ type: Date, default: null }) archivedAt!: Date | null;

  // Supplied by `timestamps: true`; declared (undecorated) so lean() reads type.
  createdAt!: Date;
  updatedAt!: Date;
}

export type ProposalDocumentDocument = HydratedDocument<ProposalDocument>;
export const ProposalDocumentSchema = SchemaFactory.createForClass(ProposalDocument);

// map.md §30: uniqueness is enforced by the database, not by application checks.
ProposalDocumentSchema.index({ organizationId: 1, documentNumber: 1 }, { unique: true });
ProposalDocumentSchema.index({ organizationId: 1, status: 1 });
ProposalDocumentSchema.index({ organizationId: 1, customerId: 1 });
ProposalDocumentSchema.index({ organizationId: 1, createdAt: -1 });
ProposalDocumentSchema.index({ organizationId: 1, assignedToId: 1 });
// share.tokenHash's sparse index comes from the prop on the Share subdocument.
