import { ConditionEvaluator } from './condition.evaluator';
import { CompileInput, DocumentCompiler } from './document.compiler';
import { FormulaEngine } from './formula.engine';
import { PricingCalculator } from './pricing.calculator';
import { TemplateSchemaValidator } from './template-schema.validator';
import { VariableResolver } from './variable.resolver';

describe('DocumentCompiler', () => {
  const formulas = new FormulaEngine();
  const conditions = new ConditionEvaluator();
  const validator = new TemplateSchemaValidator(formulas);
  const compiler = new DocumentCompiler(
    new VariableResolver(conditions, formulas),
    conditions,
    new PricingCalculator(formulas),
  );

  const line = {
    id: 'l1',
    kind: 'ITEM' as const,
    name: 'Modular wardrobe',
    description: '',
    unit: 'sq ft',
    pricingMode: 'QUANTITY_RATE' as const,
    quantity: 10,
    days: 1,
    rate: 165_000,
    percent: 0,
    formula: '',
    manualAmount: 0,
    taxRateId: null,
    taxPercent: 0,
    discount: { mode: 'PERCENT' as const, value: 0 },
    optional: false,
    selected: true,
  };

  const input = (blocks: unknown[]): CompileInput => ({
    schema: validator.parseDocumentSchema({ blocks }),
    fields: validator.parseFieldSchema({}),
    style: validator.parseStyleSchema({}),
    answers: {},
    packages: [],
    sections: [{ id: 's1', title: 'Items', lines: [line] }],
    taxRates: [],
    overallDiscount: { mode: 'PERCENT', value: 0 },
    charges: [],
    taxInclusive: false,
    roundOff: true,
    meta: {
      documentNumber: 'Q-2026-00002',
      documentDate: new Date('2026-08-10T00:00:00Z'),
      validUntil: new Date('2026-08-25T00:00:00Z'),
      currency: 'INR',
      locale: 'en-IN',
      customer: {
        name: 'Meera Krishnan',
        companyName: 'Aura Interiors',
        email: '',
        phone: '',
        billingAddress: '',
      },
      company: { name: 'Atlas', address: '', phone: '', email: '' },
      terms: '',
      paymentTerms: '',
      customerNotes: '',
    },
  });

  const block = (overrides: Record<string, unknown>) => ({
    id: 'b1',
    type: 'text',
    label: '',
    content: '',
    items: [],
    ...overrides,
  });

  describe('fallback body', () => {
    it('prices a document that has no template at all', () => {
      const compiled = compiler.compile(input([]));

      expect(compiled.blocks.map((entry) => entry.type)).toEqual(['text', 'pricingTable']);
      expect(compiled.blocks[0].content).toContain('Meera Krishnan');
    });

    it('falls back when every authored block is conditionally hidden', () => {
      const compiled = compiler.compile(
        input([
          block({
            type: 'pricingTable',
            condition: { mode: 'all', rules: [{ id: 'r1', field: 'vip', operator: 'IS_NOT_EMPTY', value: '' }] },
          }),
        ]),
      );

      expect(compiled.blocks.some((entry) => entry.type === 'pricingTable')).toBe(true);
    });

    it('falls back when the template is only structural blocks', () => {
      const compiled = compiler.compile(
        input([block({ id: 'd1', type: 'divider' }), block({ id: 'sp1', type: 'spacer' })]),
      );

      expect(compiled.blocks.some((entry) => entry.type === 'pricingTable')).toBe(true);
    });

    it('falls back when the template only contains an empty list block', () => {
      const compiled = compiler.compile(
        input([block({ id: 'i1', type: 'repeatingList', label: 'Highlights', items: [] })]),
      );

      expect(compiled.blocks.some((entry) => entry.type === 'pricingTable')).toBe(true);
    });

    it('leaves a real template alone', () => {
      const compiled = compiler.compile(
        input([block({ type: 'heading', content: 'Our proposal' }), block({ id: 'b2', type: 'pricingTable' })]),
      );

      expect(compiled.blocks).toHaveLength(2);
      expect(compiled.blocks[0].content).toBe('Our proposal');
    });

    it('does not fall back for a template whose only block is prose', () => {
      const compiled = compiler.compile(input([block({ type: 'text', content: 'Rates on request.' })]));

      expect(compiled.blocks).toHaveLength(1);
      expect(compiled.blocks[0].content).toBe('Rates on request.');
    });

    it('still reports the real totals with the fallback body', () => {
      const compiled = compiler.compile(input([]));
      expect(compiled.pricing.totals.grandTotal).toBe(1_650_000);
    });
  });

  describe('one source per piece of content', () => {
    const withPackage = (
      blocks: unknown[],
      meta: Record<string, string> = {},
      packageOverrides: Record<string, unknown> = {},
    ) => {
      const base = input(blocks);
      return compiler.compile({
        ...base,
        packages: [
          {
            id: 'p1',
            name: 'Kerala 4N',
            description: '',
            lineIds: [],
            ...packageOverrides,
          },
        ],
        meta: { ...base.meta, ...meta },
      });
    };

    it('fills a terms block from the quotation rather than template boilerplate', () => {
      const compiled = withPackage(
        [block({ type: 'terms', label: 'Terms', items: ['Boilerplate that is not the real terms'] })],
        { terms: 'Rates hold for 15 days.\nCancellation is non-refundable.' },
      );

      const terms = compiled.blocks.find((entry) => entry.type === 'terms');
      expect(terms?.items).toEqual(['Rates hold for 15 days.', 'Cancellation is non-refundable.']);
      // The renderer skips its own terms section when the body carried them.
      expect(compiled.consumed?.terms).toBe(true);
    });

    it('leaves terms to the closing section when no terms block exists', () => {
      const compiled = withPackage([block({ type: 'pricingTable' })], { terms: 'Rates hold.' });
      expect(compiled.consumed?.terms).toBe(false);
    });

    it('fills a package block from the selected package snapshot', () => {
      const compiled = withPackage(
        [block({ type: 'package', label: 'Selected package' })],
        {},
        { description: 'Munnar, Thekkady, Alleppey' },
      );

      const pkg = compiled.blocks.find((entry) => entry.type === 'package');
      expect(pkg?.content).toBe('Kerala 4N\nMunnar, Thekkady, Alleppey');
      expect(pkg?.items).toEqual(['Kerala 4N — Munnar, Thekkady, Alleppey']);
    });

    it('fills a payment block from the quotation and marks it consumed', () => {
      const compiled = withPackage([block({ type: 'payment', label: 'Payment Terms' })], {
        paymentTerms: '50% advance to confirm\nBalance before delivery',
      });

      const payment = compiled.blocks.find((entry) => entry.type === 'payment');
      expect(payment?.items).toEqual(['50% advance to confirm', 'Balance before delivery']);
      expect(compiled.consumed?.paymentTerms).toBe(true);
    });

    it('leaves payment terms to the closing section when no payment block exists', () => {
      const compiled = withPackage([block({ type: 'pricingTable' })], { paymentTerms: '50% advance.' });
      expect(compiled.consumed?.paymentTerms).toBe(false);
    });

    it('discards template boilerplate in a payment block', () => {
      const compiled = withPackage(
        [block({ type: 'payment', label: 'Payment', items: ['Boilerplate payment text'] })],
        { paymentTerms: 'Net 30.' },
      );

      const payment = compiled.blocks.find((entry) => entry.type === 'payment');
      expect(payment?.items).toEqual(['Net 30.']);
    });

    it('drops an empty payment block rather than printing a bare heading', () => {
      const compiled = withPackage([
        block({ type: 'pricingTable' }),
        block({ id: 'b2', type: 'payment', label: 'Payment Terms' }),
      ]);

      const payment = compiled.blocks.find((entry) => entry.type === 'payment');
      expect(payment?.items).toEqual([]);
      expect(compiled.consumed?.paymentTerms).toBe(false);
    });

    it('starts pricing on a fresh page when the proposal body comes first', () => {
      const compiled = withPackage([
        block({ type: 'heading', content: 'Kerala Tour Proposal' }),
        block({ id: 'b0', type: 'text', content: 'A curated five-day itinerary for your trip.' }),
        block({ type: 'pricingTable' }),
        block({ id: 'b2', type: 'terms', label: 'Cancellation' }),
        block({ id: 'b3', type: 'payment', label: 'Payment Terms' }),
      ], {
        terms: 'Free up to 7 days',
        paymentTerms: '50% advance\nBalance before delivery',
      });

      const pricing = compiled.blocks.find((entry) => entry.type === 'pricingTable');
      const terms = compiled.blocks.find((entry) => entry.id === 'b2');
      expect(pricing?.newPage).toBe(true);
      expect(terms?.newPage).not.toBe(true);
    });

    it('leaves an explicit page break before pricing alone', () => {
      const compiled = withPackage([
        block({ type: 'heading', content: 'Kerala Tour Proposal' }),
        block({ id: 'b0', type: 'text', content: 'A curated five-day itinerary for your trip.' }),
        block({ id: 'pb1', type: 'pageBreak' }),
        block({ type: 'pricingTable' }),
      ]);

      const pricing = compiled.blocks.find((entry) => entry.type === 'pricingTable');
      expect(pricing?.newPage).not.toBe(true);
    });
  });

  describe('generic field blocks', () => {
    it('resolves a bound question into a field block', () => {
      const compiled = compiler.compile({
        ...input([
          block({
            id: 'deposit-block',
            type: 'currencyField',
            label: 'Deposit',
            fieldKey: 'deposit',
          }),
        ]),
        fields: validator.parseFieldSchema({
          fields: [
            {
              id: 'f1',
              key: 'deposit',
              label: 'Deposit',
              type: 'CURRENCY',
              group: 'Commercials',
              defaultValue: '15000',
            },
          ],
        }),
      });

      expect(compiled.blocks[0]).toMatchObject({
        type: 'currencyField',
        label: 'Deposit',
        content: '₹15,000.00',
      });
    });

    it('keeps a generic repeating list as authored list content', () => {
      const compiled = compiler.compile(
        input([
          block({
            id: 'list-1',
            type: 'repeatingList',
            label: 'Included',
            items: ['Airport pickup', 'Breakfast'],
          }),
        ]),
      );

      expect(compiled.blocks[0]).toMatchObject({
        type: 'repeatingList',
        items: ['Airport pickup', 'Breakfast'],
      });
    });
  });
  describe('a document-authored body', () => {
    const body = (html: string): CompileInput => ({ ...input([]), documentHtml: html });

    it('fills in the quotation values and keeps the item table for the renderer', () => {
      const compiled = compiler.compile(
        body(
          '<p>Dear <span data-dynamic-field="customer_name">Customer name</span>,</p>' +
            '<p>Total <span data-dynamic-field="grand_total">Grand total</span></p>' +
            '<div data-item-table="true" data-columns="name,amount"></div>',
        ),
      );

      expect(compiled.body).toContain('Dear Meera Krishnan,');
      expect(compiled.body).toContain('₹16,500.00');
      // Pricing markup is the renderer's job, so the marker survives compilation.
      expect(compiled.body).toContain('data-item-table');
      expect(compiled.body).not.toContain('data-dynamic-field');
    });

    it('prints dates the way a person writes them', () => {
      const compiled = compiler.compile(
        body('<p><span data-dynamic-field="document_date">Date</span></p>'),
      );

      expect(compiled.body).toContain('10 Aug 2026');
    });

    it('does not replace the body with the fallback, even with no blocks', () => {
      const compiled = compiler.compile(body('<p>Just a covering letter.</p>'));

      expect(compiled.body).toContain('Just a covering letter.');
      expect(compiled.blocks).toEqual([]);
    });

    it('leaves a block-authored template untouched', () => {
      const compiled = compiler.compile(input([block({ content: 'Hello' })]));

      expect(compiled.body).toBeUndefined();
      expect(compiled.blocks).toHaveLength(1);
    });

    it('claims the terms so the renderer does not print them twice', () => {
      const withTerms = compiler.compile(
        body('<h2>Terms</h2><p><span data-dynamic-field="terms">Terms</span></p>'),
      );
      const without = compiler.compile(body('<p>No terms here.</p>'));

      expect(withTerms.consumed).toEqual({ terms: true, paymentTerms: false });
      expect(without.consumed).toEqual({ terms: false, paymentTerms: false });
    });

    it('will not let an invented field overwrite a real total', () => {
      const compiled = compiler.compile({
        ...body('<p><span data-dynamic-field="grand_total">Grand total</span></p>'),
        fields: validator.parseFieldSchema({
          fields: [
            {
              id: 'f1',
              key: 'grand_total',
              label: 'Grand total',
              type: 'TEXT',
              group: 'General',
              defaultValue: 'one rupee',
            },
          ],
        }),
        answers: { grand_total: 'one rupee' },
      });

      expect(compiled.body).toContain('₹16,500.00');
      expect(compiled.body).not.toContain('one rupee');
    });

    it('strips anything dangerous the body arrived with', () => {
      const compiled = compiler.compile(
        body('<p onclick="steal()">Hello</p><script>alert(1)</script>'),
      );

      expect(compiled.body).toBe('<p>Hello</p>');
    });
  });
});
