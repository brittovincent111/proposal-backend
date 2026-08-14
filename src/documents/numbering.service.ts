import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';

import { OrganizationSettingsDocument } from 'src/organizations/organization-settings.schema';
import {
  DocumentSequence,
  DocumentSequenceDocument,
} from './schemas/document-sequence.schema';

@Injectable()
export class NumberingService {
  constructor(
    @InjectModel(DocumentSequence.name)
    private readonly sequences: Model<DocumentSequenceDocument>,
  ) {}

  /**
   * Allocates the next document number — map.md §30.
   *
   * A single atomic `findOneAndUpdate` with `$inc` and `upsert` is the whole
   * mechanism: two concurrent creates increment the same counter and read back
   * different values. `SELECT MAX(number) + 1` cannot make that promise, and the
   * unique index on (organizationId, documentNumber) is the backstop if it ever
   * does go wrong.
   */
  async allocate(
    organizationId: Types.ObjectId,
    settings: Pick<
      OrganizationSettingsDocument,
      'documentPrefix' | 'documentSequenceFormat' | 'sequencePadding' | 'resetSequenceAnnually'
    >,
    now = new Date(),
  ): Promise<{ number: string; sequence: number }> {
    const year = settings.resetSequenceAnnually ? now.getFullYear() : 0;

    const sequence = await this.sequences.findOneAndUpdate(
      { organizationId, sequenceKey: 'DOCUMENT', year },
      { $inc: { currentValue: 1 } },
      { new: true, upsert: true, setDefaultsOnInsert: true },
    );

    return {
      number: this.format(settings, sequence.currentValue, now),
      sequence: sequence.currentValue,
    };
  }

  /** Tokens: {PREFIX} {YYYY} {YY} {MM} {SEQ}. */
  format(
    settings: Pick<
      OrganizationSettingsDocument,
      'documentPrefix' | 'documentSequenceFormat' | 'sequencePadding'
    >,
    value: number,
    now: Date,
  ): string {
    return settings.documentSequenceFormat
      .replace('{PREFIX}', settings.documentPrefix)
      .replace('{YYYY}', String(now.getFullYear()))
      .replace('{YY}', String(now.getFullYear()).slice(-2))
      .replace('{MM}', String(now.getMonth() + 1).padStart(2, '0'))
      .replace('{SEQ}', String(value).padStart(settings.sequencePadding, '0'));
  }
}
