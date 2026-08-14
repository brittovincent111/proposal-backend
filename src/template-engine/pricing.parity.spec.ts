import { FormulaEngine } from './formula.engine';
import { PRICING_CASES } from './pricing.cases';
import { PricingCalculator } from './pricing.calculator';
import { Discount, DocumentLine, ExtraCharge, TaxRateSnapshot } from './pricing.types';

/**
 * The server's half of the cross-engine contract.
 *
 * The same cases and the same expected totals run against the editor engine in
 * qtn-builder/src/lib/pricing/parity.test.ts. A change that moves one engine and
 * not the other fails here — which is the point: the number the operator
 * negotiates with and the number stored on the revision are produced by two
 * different implementations.
 */
const TAX_RATES: TaxRateSnapshot[] = [
  { id: 'gst18', name: 'GST 18%', percent: 18, components: [] },
  { id: 'gst5', name: 'GST 5%', percent: 5, components: [] },
  { id: 'exempt', name: 'Exempt', percent: 0, components: [] },
];

function toLine(raw: Record<string, unknown>): DocumentLine {
  return {
    kind: 'ITEM',
    name: 'Line',
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
    taxPercent: 0,
    optional: false,
    selected: true,
    ...raw,
  } as unknown as DocumentLine;
}

describe('pricing parity with the editor engine', () => {
  const pricing = new PricingCalculator(new FormulaEngine());

  for (const entry of PRICING_CASES) {
    it(entry.name, () => {
      const totals = pricing.calculate({
        sections: [
          {
            id: 's1',
            title: 'Items',
            lines: (entry.lines as unknown as Record<string, unknown>[]).map(toLine),
          },
        ],
        taxRates: TAX_RATES,
        overallDiscount: entry.overallDiscount as Discount,
        charges: entry.charges as unknown as ExtraCharge[],
        taxInclusive: entry.taxInclusive,
        roundOff: entry.roundOff,
        ...('scope' in entry ? { scope: entry.scope as Record<string, number> } : {}),
      });

      expect({
        subtotal: totals.subtotal,
        lineDiscountTotal: totals.lineDiscountTotal,
        overallDiscountTotal: totals.overallDiscountTotal,
        discountTotal: totals.discountTotal,
        taxTotal: totals.taxTotal,
        chargesTotal: totals.chargesTotal,
        roundOffAdjustment: totals.roundOffAdjustment,
        grandTotal: totals.grandTotal,
        optionalTotal: totals.optionalTotal,
        taxSummary: totals.taxSummary.map((row) => ({
          name: row.name,
          percent: row.percent,
          taxable: row.taxable,
          tax: row.tax,
        })),
      }).toEqual(entry.expected);
    });
  }
});
