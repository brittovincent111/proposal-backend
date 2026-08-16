import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

@Schema({ collection: 'leads', timestamps: true })
export class Lead {
  @Prop({ required: true, trim: true, maxlength: 120 })
  name!: string;

  @Prop({ required: true, lowercase: true, trim: true, maxlength: 200 })
  email!: string;

  @Prop({ required: true, trim: true, maxlength: 160 })
  companyName!: string;

  @Prop({ type: String, default: null, trim: true, maxlength: 40 })
  phone!: string | null;

  @Prop({ type: Number, default: null, min: 1, max: 5000 })
  teamSize!: number | null;

  @Prop({ type: String, default: null, trim: true, maxlength: 2000 })
  message!: string | null;

  @Prop({ type: String, default: null, trim: true, maxlength: 40 })
  desiredPlanCode!: string | null;

  @Prop({ type: String, default: null, trim: true, maxlength: 80 })
  source!: string | null;

  @Prop({ default: '' })
  ipHash!: string;

  @Prop({ default: '' })
  userAgent!: string;
}

export type LeadDocument = HydratedDocument<Lead>;
export const LeadSchema = SchemaFactory.createForClass(Lead);

LeadSchema.index({ createdAt: -1 });
LeadSchema.index({ email: 1, createdAt: -1 });
