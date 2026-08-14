import { Injectable } from '@nestjs/common';

import { nextLocalId } from 'src/common/utils/ids';
import { DocumentLine } from './pricing.types';

export interface ResolvablePackage {
  id: string;
  name: string;
  description: string;
  pricingMode: 'SUM_OF_ITEMS' | 'FIXED_PRICE' | 'DISCOUNTED_TOTAL';
  fixedPrice: number;
  discountPercent: number;
  lines: Array<{
    itemId: string | null;
    name: string;
    description: string;
    unit: string;
    quantity: number;
    rate: number;
    taxRateId: string | null;
    optional: boolean;
  }>;
}

/**
 * Expands a package into editable document lines — map.md §16, §72.
 *
 * The result is a *snapshot*: names, rates and units are copied by value, so a
 * later package edit cannot alter a document that already quoted it. Nothing
 * downstream reads the package back through `packageId`.
 */
@Injectable()
export class PackageResolver {
  resolve(entry: ResolvablePackage, defaultTaxRateId: string | null): DocumentLine[] {
    if (entry.pricingMode === 'FIXED_PRICE') {
      // A fixed-price package is quoted as one line; the components stay as notes.
      // Expanding it line by line would invite someone to re-add the parts and
      // arrive at a different number than the price that was agreed.
      return [
        this.line({
          packageId: entry.id,
          packageName: entry.name,
          name: entry.name,
          description: entry.lines.map((line) => line.name).join(', '),
          unit: 'package',
          quantity: 1,
          rate: entry.fixedPrice,
          taxRateId: entry.lines[0]?.taxRateId ?? defaultTaxRateId,
          optional: false,
        }),
      ];
    }

    // Per line rather than on the total, so tax is charged on the discounted
    // amount for each line's own rate.
    const discount =
      entry.pricingMode === 'DISCOUNTED_TOTAL' && entry.discountPercent > 0
        ? { mode: 'PERCENT' as const, value: entry.discountPercent }
        : { mode: 'PERCENT' as const, value: 0 };

    return entry.lines.map((line) =>
      this.line({
        itemId: line.itemId,
        packageId: entry.id,
        packageName: entry.name,
        name: line.name,
        description: line.description,
        unit: line.unit,
        quantity: line.quantity,
        rate: line.rate,
        taxRateId: line.taxRateId ?? defaultTaxRateId,
        optional: line.optional,
        discount,
      }),
    );
  }

  private line(overrides: Partial<DocumentLine>): DocumentLine {
    return {
      id: nextLocalId('qln'),
      kind: 'ITEM',
      itemId: null,
      packageId: null,
      packageName: '',
      name: '',
      description: '',
      unit: 'nos',
      pricingMode: 'QUANTITY_RATE',
      quantity: 1,
      days: 1,
      rate: 0,
      percent: 0,
      formula: '',
      manualAmount: 0,
      discount: { mode: 'PERCENT', value: 0 },
      taxRateId: null,
      optional: false,
      selected: true,
      ...overrides,
    };
  }
}
