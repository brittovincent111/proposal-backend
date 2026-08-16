import { ConditionEvaluator } from 'src/template-engine/condition.evaluator';
import { CompileInput, DocumentCompiler } from 'src/template-engine/document.compiler';
import { FormulaEngine } from 'src/template-engine/formula.engine';
import { PricingCalculator } from 'src/template-engine/pricing.calculator';
import { TemplateSchemaValidator } from 'src/template-engine/template-schema.validator';
import { VariableResolver } from 'src/template-engine/variable.resolver';
import { HtmlRendererService } from './html-renderer.service';

/*
 * A dynamic field the author styled in the editor.
 *
 * The editor stores inline styling as a mark, which serialises as a span
 * wrapping the token rather than as an attribute on it. Substitution replaces
 * only the inner marker, so the wrapper has to survive sanitising, compiling
 * and rendering untouched — otherwise the author's font size and colour are
 * visible while authoring and gone from the sent PDF.
 */
describe('a styled dynamic field, from editor output to rendered page', () => {
  const formulas = new FormulaEngine();
  const conditions = new ConditionEvaluator();
  const validator = new TemplateSchemaValidator(formulas);
  const compiler = new DocumentCompiler(
    new VariableResolver(conditions, formulas),
    conditions,
    new PricingCalculator(formulas),
  );
  const renderer = new HtmlRendererService();

  // Copied verbatim from a real editor's getHTML() for a styled, bolded token.
  // An operator-answered field, not a computed total: a proposal never prints
  // one, and the styling round-trip this guards is the same either way.
  const EDITOR_OUTPUT =
    '<table><tbody><tr><td><p><strong><span style="font-size: 20px; color: rgb(11, 92, 173);">₹' +
    '<span data-dynamic-field="annual_price" data-label="amount value" data-field-type="text" class="qtn-token" data-token="true">amount value</span>' +
    ' / year</span></strong></p></td></tr></tbody></table>';

  const input: CompileInput = {
    kind: 'PROPOSAL',
    schema: validator.parseDocumentSchema({ blocks: [] }),
    fields: validator.parseFieldSchema({
      fields: [
        {
          id: 'f1',
          key: 'annual_price',
          label: 'Annual price',
          type: 'CURRENCY',
        },
      ],
    }),
    style: validator.parseStyleSchema({}),
    answers: { annual_price: 2990 },
    unusedSections: [
      {
        id: 's1',
        title: 'Items',
        lines: [
          {
            id: 'l1',
            kind: 'ITEM',
            name: 'Platform',
            description: '',
            unit: 'nos',
            pricingMode: 'QUANTITY_RATE',
            quantity: 1,
            days: 1,
            rate: 299_000,
            percent: 0,
            formula: '',
            manualAmount: 0,
            taxRateId: null,
            taxPercent: 0,
            discount: { mode: 'PERCENT', value: 0 },
            optional: false,
            selected: true,
          },
        ],
      },
    ],
    taxRates: [],
    overallDiscount: { mode: 'PERCENT', value: 0 },
    charges: [],
    taxInclusive: false,
    roundOff: true,
    meta: {
      documentNumber: 'Q-2026-00002',
      documentDate: new Date('2026-08-14T00:00:00Z'),
      validUntil: new Date('2026-08-29T00:00:00Z'),
      currency: 'INR',
      locale: 'en-IN',
      customer: { name: 'Vantage', companyName: 'Vantage', email: '', phone: '' },
      company: { name: 'VeloCrew Technologies', email: '', phone: '', address: '' },
    },
    documentHtml: EDITOR_OUTPUT,
  } as unknown as CompileInput;

  it('carries the wrapper all the way to the rendered page', () => {
    const compiled = compiler.compile(input);
    if (compiled.kind !== 'PROPOSAL') throw new Error('expected a proposal');
    const page = renderer.render(compiled);

    // Sanitising normalises the spacing, so match on the declarations.
    expect(compiled.body).toContain('font-size:20px');
    expect(compiled.body).toContain('color:rgb(11, 92, 173)');
    expect(compiled.body).toContain('₹2,990.00');
    expect(page).toContain(
      '<strong><span style="font-size:20px;color:rgb(11, 92, 173)">₹₹2,990.00 / year</span></strong>',
    );
    expect(page).not.toContain('data-dynamic-field');
  });
});
