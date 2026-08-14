import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

/**
 * Per-organization counter behind document numbering — map.md §30.
 *
 * Allocation is a single atomic `findOneAndUpdate` with `$inc`, never
 * "read max, add one": two concurrent creates must not be able to observe the
 * same value.
 */
@Schema({ collection: 'document_sequences', timestamps: true })
export class DocumentSequence {
  @Prop({ type: Types.ObjectId, required: true })
  organizationId!: Types.ObjectId;

  @Prop({ required: true, default: 'DOCUMENT' })
  sequenceKey!: string;

  /** 0 when numbering does not reset annually. */
  @Prop({ required: true, default: 0 })
  year!: number;

  @Prop({ required: true, default: 0 })
  currentValue!: number;
}

export type DocumentSequenceDocument = HydratedDocument<DocumentSequence>;
export const DocumentSequenceSchema = SchemaFactory.createForClass(DocumentSequence);

DocumentSequenceSchema.index(
  { organizationId: 1, sequenceKey: 1, year: 1 },
  { unique: true },
);
