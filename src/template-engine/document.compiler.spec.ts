import { ConditionEvaluator } from './condition.evaluator';
import {
  CompiledProposal,
  CompiledQuotation,
  DocumentCompiler,
  ProposalCompileInput,
  QuotationCompileInput,
} from './document.compiler';
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

  const meta = () => ({
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
  });

  const input = (blocks: unknown[]): ProposalCompileInput => ({
    kind: 'PROPOSAL',
    schema: validator.parseDocumentSchema({ blocks }),
    fields: validator.parseFieldSchema({}),
    style: validator.parseStyleSchema({}),
    answers: {},
    meta: meta(),
  });

  const quotationInput = (): QuotationCompileInput => ({
    kind: 'QUOTATION',
    style: validator.parseStyleSchema({}),
    sections: [{ id: 's1', title: 'Items', lines: [line] }],
    taxRates: [],
    overallDiscount: { mode: 'PERCENT', value: 0 },
    charges: [],
    taxInclusive: false,
    roundOff: true,
    meta: meta(),
  });

  /** Narrowing helpers, so a kind mix-up is a test failure rather than a cast. */
  const asProposal = (input: ProposalCompileInput): CompiledProposal => {
    const compiled = compiler.compile(input);
    if (compiled.kind !== 'PROPOSAL') throw new Error('expected a proposal');
    return compiled;
  };

  const asQuotation = (input: QuotationCompileInput): CompiledQuotation => {
    const compiled = compiler.compile(input);
    if (compiled.kind !== 'QUOTATION') throw new Error('expected a quotation');
    return compiled;
  };

  const block = (overrides: Record<string, unknown>) => ({
    id: 'b1',
    type: 'text',
    label: '',
    content: '',
    items: [],
    ...overrides,
  });

  describe('the two kinds', () => {
    it('gives a quotation totals and no blocks', () => {
      const compiled = asQuotation(quotationInput());

      expect(compiled.pricing.totals.grandTotal).toBe(1_650_000);
      expect('blocks' in compiled).toBe(false);
    });

    it('never prices a proposal', () => {
      // The wall, asserted at its source: the calculator is not called at all,
      // rather than called and its result discarded.
      const spy = jest.spyOn(PricingCalculator.prototype, 'calculate');
      try {
        const compiled = asProposal(input([block({ type: 'text', content: 'Hello' })]));

        expect(spy).not.toHaveBeenCalled();
        expect('pricing' in compiled).toBe(false);
      } finally {
        spy.mockRestore();
      }
    });

    it('resolves a money token in a proposal to nothing, never to a number', () => {
      // The validator rejects these at publish; this is the second line of
      // defence for a body authored before that rule existed.
      const compiled = asProposal(input([block({ type: 'text', content: 'Total: {{grand_total}}' })]));

      expect(compiled.blocks[0].content.trim()).toBe('Total:');
      expect(compiled.blocks[0].content).not.toContain('grand_total');
    });
  });

  describe('fallback body', () => {
    it('falls back when every authored block is conditionally hidden', () => {
      const compiled = asProposal(
        input([
          block({
            type: 'text',
            content: 'VIP welcome',
            condition: { mode: 'all', rules: [{ id: 'r1', field: 'vip', operator: 'IS_NOT_EMPTY', value: '' }] },
          }),
        ]),
      );

      expect(compiled.blocks).toHaveLength(1);
      expect(compiled.blocks[0].content).toContain('Meera Krishnan');
    });

    it('falls back when the template is only structural blocks', () => {
      const compiled = asProposal(
        input([block({ id: 'd1', type: 'divider' }), block({ id: 'sp1', type: 'spacer' })]),
      );

      expect(compiled.blocks[0].content).toContain('Meera Krishnan');
    });

    it('falls back when the template only contains an empty list block', () => {
      const compiled = asProposal(
        input([block({ id: 'i1', type: 'repeatingList', label: 'Highlights', items: [] })]),
      );

      expect(compiled.blocks[0].content).toContain('Meera Krishnan');
    });

    it('leaves a real template alone', () => {
      const compiled = asProposal(
        input([
          block({ type: 'heading', content: 'Our proposal' }),
          block({ id: 'b2', type: 'text', content: 'Details below.' }),
        ]),
      );

      expect(compiled.blocks).toHaveLength(2);
      expect(compiled.blocks[0].content).toBe('Our proposal');
    });

    it('does not fall back for a template whose only block is prose', () => {
      const compiled = asProposal(input([block({ type: 'text', content: 'Rates on request.' })]));

      expect(compiled.blocks).toHaveLength(1);
      expect(compiled.blocks[0].content).toBe('Rates on request.');
    });
  });

  describe('one source per piece of content', () => {
    const withMeta = (blocks: unknown[], metaOverrides: Record<string, string> = {}) => {
      const base = input(blocks);
      return asProposal({ ...base, meta: { ...base.meta, ...metaOverrides } });
    };

    it('fills a terms block from the quotation rather than template boilerplate', () => {
      const compiled = withMeta(
        [block({ type: 'terms', label: 'Terms', items: ['Boilerplate that is not the real terms'] })],
        { terms: 'Rates hold for 15 days.\nCancellation is non-refundable.' },
      );

      const terms = compiled.blocks.find((entry) => entry.type === 'terms');
      expect(terms?.items).toEqual(['Rates hold for 15 days.', 'Cancellation is non-refundable.']);
      // The renderer skips its own terms section when the body carried them.
      expect(compiled.consumed?.terms).toBe(true);
    });

    it('leaves terms to the closing section when no terms block exists', () => {
      const compiled = withMeta([block({ type: 'text', content: 'Hello' })], { terms: 'Rates hold.' });
      expect(compiled.consumed?.terms).toBe(false);
    });

    it('fills a payment block from the quotation and marks it consumed', () => {
      const compiled = withMeta([block({ type: 'payment', label: 'Payment Terms' })], {
        paymentTerms: '50% advance to confirm\nBalance before delivery',
      });

      const payment = compiled.blocks.find((entry) => entry.type === 'payment');
      expect(payment?.items).toEqual(['50% advance to confirm', 'Balance before delivery']);
      expect(compiled.consumed?.paymentTerms).toBe(true);
    });

    it('leaves payment terms to the closing section when no payment block exists', () => {
      const compiled = withMeta([block({ type: 'text', content: 'Hello' })], { paymentTerms: '50% advance.' });
      expect(compiled.consumed?.paymentTerms).toBe(false);
    });

    it('discards template boilerplate in a payment block', () => {
      const compiled = withMeta(
        [block({ type: 'payment', label: 'Payment', items: ['Boilerplate payment text'] })],
        { paymentTerms: 'Net 30.' },
      );

      const payment = compiled.blocks.find((entry) => entry.type === 'payment');
      expect(payment?.items).toEqual(['Net 30.']);
    });

    it('drops an empty payment block rather than printing a bare heading', () => {
      const compiled = withMeta([
        block({ type: 'text', content: 'Hello' }),
        block({ id: 'b2', type: 'payment', label: 'Payment Terms' }),
      ]);

      const payment = compiled.blocks.find((entry) => entry.type === 'payment');
      expect(payment?.items).toEqual([]);
      expect(compiled.consumed?.paymentTerms).toBe(false);
    });
  });

  describe('generic field blocks', () => {
    it('resolves a bound question into a field block', () => {
      const compiled = asProposal({
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
      const compiled = asProposal(
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
    const body = (html: string): ProposalCompileInput => ({ ...input([]), documentHtml: html });

    it('fills in the values it has and prints no prices at all', () => {
      const compiled = asProposal(
        body(
          '<p>Dear <span data-dynamic-field="customer_name">Customer name</span>,</p>' +
            '<p>Total <span data-dynamic-field="grand_total">Grand total</span></p>' +
            '<div data-item-table="true" data-columns="name,amount"></div>',
        ),
      );

      expect(compiled.body).toContain('Dear Meera Krishnan,');
      expect(compiled.body).not.toContain('data-dynamic-field');
      // Both halves of the wall in one body: the money token resolves to
      // nothing rather than a number, and the sanitiser drops the table marker
      // instead of leaving it for a renderer that no longer expands it.
      expect(compiled.body).not.toMatch(/₹|\d/);
      expect(compiled.body).not.toContain('data-item-table');
    });

    it('prints dates the way a person writes them, not as ISO', () => {
      const compiled = asProposal(
        body('<p><span data-dynamic-field="document_date">Date</span></p>'),
      );

      // Matched loosely on purpose: ICU separates en-IN date parts with a space
      // on some versions and a hyphen on others, and pinning one made this fail
      // on Node 16 for reasons that have nothing to do with the behaviour under
      // test. What matters is that it is not the ISO form a block would print.
      expect(compiled.body).toMatch(/10[\s-]Aug[\s-]2026/);
      expect(compiled.body).not.toContain('2026-08-10');
    });

    it('does not replace the body with the fallback, even with no blocks', () => {
      const compiled = asProposal(body('<p>Just a covering letter.</p>'));

      expect(compiled.body).toContain('Just a covering letter.');
      expect(compiled.blocks).toEqual([]);
    });

    it('leaves a block-authored template untouched', () => {
      const compiled = asProposal(input([block({ content: 'Hello' })]));

      expect(compiled.body).toBeUndefined();
      expect(compiled.blocks).toHaveLength(1);
    });

    it('claims the terms so the renderer does not print them twice', () => {
      const withTerms = asProposal(
        body('<h2>Terms</h2><p><span data-dynamic-field="terms">Terms</span></p>'),
      );
      const without = asProposal(body('<p>No terms here.</p>'));

      expect(withTerms.consumed).toEqual({ terms: true, paymentTerms: false });
      expect(without.consumed).toEqual({ terms: false, paymentTerms: false });
    });

    it('lets a question named grand_total print its own answer', () => {
      // The inverse of the old rule, and deliberately so. There is no reserved
      // total left for an invented field to shadow, so the key is just a key —
      // whatever the operator typed is what prints.
      const compiled = asProposal({
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

      expect(compiled.body).toContain('one rupee');
    });

    it('strips anything dangerous the body arrived with', () => {
      const compiled = asProposal(
        body('<p onclick="steal()">Hello</p><script>alert(1)</script>'),
      );

      expect(compiled.body).toBe('<p>Hello</p>');
    });
  });
});
