import { FormulaEngine } from './formula.engine';
import { PricingCalculator } from './pricing.calculator';
import { DocumentLine, DocumentSection, PricingInput, TaxRateSnapshot } from './pricing.types';

const GST18: TaxRateSnapshot = {
  id: 'tax18',
  name: 'GST 18%',
  percent: 18,
  components: [
    { name: 'CGST', percent: 9 },
    { name: 'SGST', percent: 9 },
  ],
};

function line(overrides: Partial<DocumentLine> = {}): DocumentLine {
  return {
    id: overrides.id ?? 'l1',
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
    optional: false,
    selected: true,
    ...overrides,
  };
}

function input(lines: DocumentLine[], overrides: Partial<PricingInput> = {}): PricingInput {
  const sections: DocumentSection[] = [{ id: 's1', title: 'Items', lines }];
  return {
    sections,
    taxRates: [GST18],
    overallDiscount: { mode: 'PERCENT', value: 0 },
    charges: [],
    taxInclusive: false,
    roundOff: false,
    ...overrides,
  };
}

describe('PricingCalculator', () => {
  const calculator = new PricingCalculator(new FormulaEngine());

  it('multiplies quantity by rate and adds exclusive tax', () => {
    const totals = calculator.calculate(
      input([line({ quantity: 2, rate: 100_000, taxRateId: 'tax18' })]),
    );

    expect(totals.subtotal).toBe(200_000);
    expect(totals.taxTotal).toBe(36_000);
    expect(totals.grandTotal).toBe(236_000);
  });

  it('extracts tax from inclusive rates instead of adding it', () => {
    const totals = calculator.calculate(
      input([line({ quantity: 1, rate: 118_000, taxRateId: 'tax18' })], { taxInclusive: true }),
    );

    expect(totals.taxTotal).toBe(18_000);
    expect(totals.grandTotal).toBe(118_000);
  });

  it('splits a tax rate into its components on the summary', () => {
    const totals = calculator.calculate(
      input([line({ quantity: 1, rate: 100_000, taxRateId: 'tax18' })]),
    );

    expect(totals.taxSummary).toHaveLength(2);
    expect(totals.taxSummary.map((row) => row.name).sort()).toEqual(['CGST', 'SGST']);
    expect(totals.taxSummary.reduce((sum, row) => sum + row.tax, 0)).toBe(totals.taxTotal);
  });

  it('spreads the overall discount before tax so the tax stays correct', () => {
    // Taking 10% off the grand total instead would over-charge tax by ₹1.80.
    const totals = calculator.calculate(
      input([line({ quantity: 1, rate: 100_000, taxRateId: 'tax18' })], {
        overallDiscount: { mode: 'PERCENT', value: 10 },
      }),
    );

    expect(totals.overallDiscountTotal).toBe(10_000);
    expect(totals.taxTotal).toBe(16_200);
    expect(totals.grandTotal).toBe(106_200);
  });

  it('allocates the overall discount across lines without losing a paisa', () => {
    const totals = calculator.calculate(
      input(
        [
          line({ id: 'a', rate: 33_333 }),
          line({ id: 'b', rate: 33_333 }),
          line({ id: 'c', rate: 33_334 }),
        ],
        { overallDiscount: { mode: 'AMOUNT', value: 100 } },
      ),
    );

    const allocated = Object.values(totals.lines).reduce(
      (sum, entry) => sum + entry.allocatedDiscount,
      0,
    );
    expect(allocated).toBe(10_000);
    expect(totals.grandTotal).toBe(90_000);
  });

  it('excludes unselected optional lines from the total but reports them', () => {
    const totals = calculator.calculate(
      input([
        line({ id: 'base', rate: 100_000 }),
        line({ id: 'addon', rate: 50_000, optional: true, selected: false }),
      ]),
    );

    expect(totals.subtotal).toBe(100_000);
    expect(totals.grandTotal).toBe(100_000);
    expect(totals.optionalTotal).toBe(50_000);
    expect(totals.lines.addon.excluded).toBe(true);
  });

  it('prices a percentage line off the running subtotal above it', () => {
    const totals = calculator.calculate(
      input([
        line({ id: 'base', rate: 100_000 }),
        line({ id: 'fee', pricingMode: 'PERCENTAGE', percent: 10 }),
      ]),
    );

    expect(totals.lines.fee.gross).toBe(10_000);
    expect(totals.grandTotal).toBe(110_000);
  });

  it('prices a formula line from the supplied scope', () => {
    const totals = calculator.calculate(
      input([line({ id: 'f', pricingMode: 'FORMULA', formula: 'nights * rate' })], {
        scope: { nights: 3, rate: 1500 },
      }),
    );

    expect(totals.lines.f.gross).toBe(450_000);
  });

  it('treats a broken formula as zero rather than failing the whole document', () => {
    const totals = calculator.calculate(
      input([line({ id: 'f', pricingMode: 'FORMULA', formula: 'unknown_field * 2' })]),
    );
    expect(totals.lines.f.gross).toBe(0);
  });

  it('multiplies rate by quantity and days', () => {
    const totals = calculator.calculate(
      input([line({ pricingMode: 'QUANTITY_RATE_DAYS', quantity: 2, days: 3, rate: 100_000 })]),
    );
    expect(totals.subtotal).toBe(600_000);
  });

  it('caps a line discount at the line amount', () => {
    const totals = calculator.calculate(
      input([line({ rate: 10_000, discount: { mode: 'AMOUNT', value: 500 } })]),
    );
    expect(totals.lineDiscountTotal).toBe(10_000);
    expect(totals.grandTotal).toBe(0);
  });

  it('ignores heading and note lines', () => {
    const totals = calculator.calculate(
      input([
        line({ id: 'h', kind: 'HEADING', name: 'Accommodation', rate: 999_999 }),
        line({ id: 'p', rate: 100_000 }),
      ]),
    );
    expect(totals.subtotal).toBe(100_000);
    expect(totals.lines.h).toBeUndefined();
  });

  it('adds charges and applies round off last', () => {
    const totals = calculator.calculate(
      input([line({ rate: 99_949 })], {
        charges: [{ id: 'c1', label: 'Delivery', amount: 100 }],
        roundOff: true,
      }),
    );

    expect(totals.chargesTotal).toBe(100);
    expect(totals.roundOffAdjustment).toBe(-49);
    expect(totals.grandTotal).toBe(100_000);
  });
});
