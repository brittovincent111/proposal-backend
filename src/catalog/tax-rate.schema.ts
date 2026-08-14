import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

@Schema({ _id: false })
export class TaxComponentEntry {
  @Prop({ required: true }) name!: string;
  @Prop({ required: true, min: 0, max: 100 }) percent!: number;
}
export const TaxComponentEntrySchema = SchemaFactory.createForClass(TaxComponentEntry);

@Schema({ collection: 'tax_rates', timestamps: true })
export class TaxRate {
  @Prop({ type: Types.ObjectId, required: true, index: true })
  organizationId!: Types.ObjectId;

  @Prop({ required: true, trim: true })
  name!: string;

  @Prop({ required: true, min: 0, max: 100 })
  percent!: number;

  /** GST splits into CGST + SGST on the printed summary; empty means a single line. */
  @Prop({ type: [TaxComponentEntrySchema], default: [] })
  components!: TaxComponentEntry[];

  @Prop({ default: false })
  isDefault!: boolean;

  @Prop({ type: Date, default: null })
  archivedAt!: Date | null;
}

export type TaxRateDocument = HydratedDocument<TaxRate>;
export const TaxRateSchema = SchemaFactory.createForClass(TaxRate);

TaxRateSchema.index({ organizationId: 1, name: 1 });
