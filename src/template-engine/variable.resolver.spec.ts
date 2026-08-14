import { ErrorCodes } from 'src/common/errors/error-codes';
import { ConditionEvaluator } from './condition.evaluator';
import { FormulaEngine } from './formula.engine';
import { TemplateSchemaValidator } from './template-schema.validator';
import { VariableResolver } from './variable.resolver';

describe('VariableResolver', () => {
  const formulas = new FormulaEngine();
  const validator = new TemplateSchemaValidator(formulas);
  const resolver = new VariableResolver(new ConditionEvaluator(), formulas);

  const parse = (fields: unknown[], formulaList: unknown[] = []) =>
    validator.parseFieldSchema({ fields, formulas: formulaList });

  const field = (key: string, overrides: Record<string, unknown> = {}) => ({
    id: `f_${key}`,
    key,
    label: key,
    type: 'TEXT',
    ...overrides,
  });

  const options = { currency: 'INR', locale: 'en-IN', reserved: {} };

  describe('validateAnswers', () => {
    it('flags a missing required answer', () => {
      const issues = resolver.validateAnswers(parse([field('destination', { required: true })]), {});
      expect(issues[0].code).toBe(ErrorCodes.FIELD_REQUIRED);
    });

    it('does not require a question that its condition hides', () => {
      // map.md §22 — a branch never shown cannot be mandatory.
      const fields = parse([
        field('needs_visa', { type: 'BOOLEAN' }),
        field('passport_number', {
          required: true,
          condition: { mode: 'all', rules: [{ id: 'r', field: 'needs_visa', operator: 'EQ', value: 'true' }] },
        }),
      ]);

      expect(resolver.validateAnswers(fields, { needs_visa: false })).toEqual([]);
      expect(resolver.validateAnswers(fields, { needs_visa: true })).toHaveLength(1);
    });

    it('rejects a non-numeric answer to a number question', () => {
      const issues = resolver.validateAnswers(parse([field('adults', { type: 'NUMBER' })]), {
        adults: 'two',
      });
      expect(issues[0].code).toBe(ErrorCodes.FIELD_TYPE_INVALID);
    });

    it('rejects a select answer outside its options', () => {
      const fields = parse([field('tier', { type: 'SELECT', options: ['Standard', 'Deluxe'] })]);
      expect(resolver.validateAnswers(fields, { tier: 'Presidential' })).toHaveLength(1);
      expect(resolver.validateAnswers(fields, { tier: 'Deluxe' })).toEqual([]);
    });

    it('validates emails, urls, percentages and dates', () => {
      expect(resolver.validateAnswers(parse([field('e', { type: 'EMAIL' })]), { e: 'nope' })).toHaveLength(1);
      expect(resolver.validateAnswers(parse([field('u', { type: 'URL' })]), { u: 'ftp://x' })).toHaveLength(1);
      expect(
        resolver.validateAnswers(parse([field('p', { type: 'PERCENTAGE' })]), { p: 120 }),
      ).toHaveLength(1);
      expect(
        resolver.validateAnswers(parse([field('d', { type: 'DATE' })]), { d: 'not-a-date' }),
      ).toHaveLength(1);
    });
  });

  describe('resolve', () => {
    it('formats answers for display by type', () => {
      const resolved = resolver.resolve(
        parse([
          field('name'),
          field('budget', { type: 'CURRENCY' }),
          field('margin', { type: 'PERCENTAGE' }),
          field('extras', { type: 'MULTI_SELECT', options: ['a', 'b'] }),
          field('insured', { type: 'BOOLEAN' }),
        ]),
        { name: 'Ravi', budget: 45000, margin: 12, extras: ['a', 'b'], insured: true },
        options,
      );

      expect(resolved.text.name).toBe('Ravi');
      expect(resolved.text.budget).toContain('45,000');
      expect(resolved.text.margin).toBe('12%');
      expect(resolved.text.extras).toBe('a, b');
      expect(resolved.text.insured).toBe('Yes');
    });

    it('exposes formula results as both text and numbers', () => {
      const resolved = resolver.resolve(
        parse(
          [field('nights', { type: 'NUMBER' })],
          [{ id: 'x', key: 'total_nights', label: '', expression: 'nights * 2' }],
        ),
        { nights: 3 },
        options,
      );

      expect(resolved.numeric.total_nights).toBe(6);
      expect(resolved.text.total_nights).toBe('6');
    });

    it('lets reserved values win over a template key of the same name', () => {
      const resolved = resolver.resolve(parse([field('grand_total')]), { grand_total: 'fake' }, {
        ...options,
        reserved: { grand_total: '₹1,00,000.00' },
      });
      expect(resolved.text.grand_total).toBe('₹1,00,000.00');
    });
  });

  describe('interpolate', () => {
    it('substitutes known tokens and blanks unknown ones', () => {
      expect(resolver.interpolate('Hi {{name}}, {{missing}}!', { name: 'Ravi' })).toBe('Hi Ravi, !');
    });

    it('leaves non-token braces alone', () => {
      expect(resolver.interpolate('{{ NotAKey }} stays', {})).toBe('{{ NotAKey }} stays');
    });
  });
});
