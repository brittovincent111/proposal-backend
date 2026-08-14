import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

/**
 * An immutable snapshot of template content once published — map.md §8.
 *
 * Documents reference a version id, never the template, which is what stops a
 * template edit from rewriting history (§29, §103).
 */
@Schema({ collection: 'template_versions', timestamps: true })
export class TemplateVersion {
  @Prop({ type: Types.ObjectId, required: true, index: true })
  templateId!: Types.ObjectId;

  /** Denormalised so version reads can be tenant-scoped without a join. */
  @Prop({ type: Types.ObjectId, required: true, index: true })
  organizationId!: Types.ObjectId;

  @Prop({ required: true, min: 1 })
  versionNumber!: number;

  @Prop({ type: Object, required: true })
  schemaJson!: Record<string, unknown>;

  @Prop({ type: Object, required: true })
  fieldSchemaJson!: Record<string, unknown>;

  @Prop({ type: Object, required: true })
  styleSchemaJson!: Record<string, unknown>;

  @Prop({ type: Object, default: {} })
  settingsJson!: Record<string, unknown>;

  /**
   * Line items a quotation starts with when it uses this template.
   *
   * Frozen with the version like everything else here, so republishing with
   * different lines cannot change a quotation that already used the old ones.
   */
  @Prop({ type: Object, default: {} })
  linesJson!: Record<string, unknown>;

  /**
   * The body as authored in the document editor, sanitised.
   *
   * When set it replaces `schemaJson.blocks` as the document's content: a
   * template is authored either as a document or as blocks, never as both. Empty
   * for every template written before the editor existed, which is what makes
   * that the safe default.
   */
  @Prop({ default: '' })
  documentHtml!: string;

  @Prop({ default: '' })
  changeNote!: string;

  @Prop({ type: Types.ObjectId, default: null })
  createdById!: Types.ObjectId | null;

  /** Null while this version is still the editable draft. */
  @Prop({ type: Date, default: null })
  publishedAt!: Date | null;
}

export type TemplateVersionDocument = HydratedDocument<TemplateVersion>;
export const TemplateVersionSchema = SchemaFactory.createForClass(TemplateVersion);

TemplateVersionSchema.index({ templateId: 1, versionNumber: 1 }, { unique: true });
