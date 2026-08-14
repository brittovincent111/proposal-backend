import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

/** Everything a generated document freezes about the seller — map.md §71. */
@Schema({ _id: false })
export class CompanyProfile {
  @Prop({ default: '' }) name!: string;
  @Prop({ default: '' }) address!: string;
  @Prop({ default: '' }) phone!: string;
  @Prop({ default: '' }) email!: string;
  @Prop({ default: '' }) website!: string;
  @Prop({ default: '' }) taxNumber!: string;
  @Prop({ default: '' }) registrationNumber!: string;
  @Prop({ default: '' }) bankDetails!: string;
}
export const CompanyProfileSchema = SchemaFactory.createForClass(CompanyProfile);

@Schema({ _id: false })
export class Branding {
  @Prop({ default: '#2563eb' }) accentColor!: string;
  @Prop({ type: String, default: null }) logoUrl!: string | null;
  @Prop({ default: '' }) footerNote!: string;
  @Prop({ default: 'A4', enum: ['A4', 'LETTER'] }) pageSize!: string;
}
export const BrandingSchema = SchemaFactory.createForClass(Branding);

@Schema({ collection: 'organization_settings', timestamps: true })
export class OrganizationSettings {
  @Prop({ type: Types.ObjectId, required: true, unique: true, index: true })
  organizationId!: Types.ObjectId;

  @Prop({ default: 'Q' })
  documentPrefix!: string;

  /** Tokens: {PREFIX} {YYYY} {YY} {MM} {SEQ} — e.g. "{PREFIX}-{YYYY}-{SEQ}". */
  @Prop({ default: '{PREFIX}-{YYYY}-{SEQ}' })
  documentSequenceFormat!: string;

  @Prop({ default: 5, min: 1, max: 12 })
  sequencePadding!: number;

  @Prop({ default: true })
  resetSequenceAnnually!: boolean;

  @Prop({ default: 15, min: 1 })
  defaultValidityDays!: number;

  @Prop({ default: 'dd MMM yyyy' })
  dateFormat!: string;

  @Prop({ type: Types.ObjectId, default: null })
  defaultTaxRateId!: Types.ObjectId | null;

  /**
   * Attached to a new quotation when the caller names no template, so the
   * operator never has to pick one to get a correct document.
   */
  @Prop({ type: Types.ObjectId, default: null })
  defaultTemplateId!: Types.ObjectId | null;

  @Prop({ default: false })
  defaultTaxInclusive!: boolean;

  @Prop({ default: true })
  defaultRoundOff!: boolean;

  /** map.md §68 — gate SEND behind an approval step. */
  @Prop({ default: false })
  requireApprovalBeforeSend!: boolean;

  @Prop({ default: 0, min: 0 })
  shareLinkValidityDays!: number;

  @Prop({ type: CompanyProfileSchema, default: () => ({}) })
  company!: CompanyProfile;

  @Prop({ type: BrandingSchema, default: () => ({}) })
  branding!: Branding;

  @Prop({ default: '' })
  defaultTerms!: string;

  @Prop({ default: '' })
  defaultPaymentTerms!: string;
}

export type OrganizationSettingsDocument = HydratedDocument<OrganizationSettings>;
export const OrganizationSettingsSchema = SchemaFactory.createForClass(OrganizationSettings);
