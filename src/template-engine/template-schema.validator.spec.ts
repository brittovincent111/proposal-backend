import { DomainException } from 'src/common/errors/domain.exception';
import { ErrorCodes } from 'src/common/errors/error-codes';
import { FormulaEngine } from './formula.engine';
import { TemplateSchemaValidator } from './template-schema.validator';
import { DocumentSchemaJson, FieldSchemaJson } from './template.contract';

describe('TemplateSchemaValidator', () => {
  const validator = new TemplateSchemaValidator(new FormulaEngine());

  const schema = (blocks: unknown[] = []): DocumentSchemaJson =>
    validator.parseDocumentSchema({ schemaVersion: 1, blocks });

  const fields = (
    fieldList: unknown[] = [],
    formulas: unknown[] = [],
  ): FieldSchemaJson =>
    validator.parseFieldSchema({ schemaVersion: 1, groups: ['General'], fields: fieldList, formulas });

  const field = (key: string, overrides: Record<string, unknown> = {}) => ({
    id: `f_${key}`,
    key,
    label: key,
    type: 'NUMBER',
    group: 'General',
    ...overrides,
  });

  const block = (overrides: Record<string, unknown> = {}) => ({
    id: 'b1',
    type: 'heading',
    label: 'Heading',
    content: 'Hello',
    ...overrides,
  });

  describe('parsing', () => {
    it('fills defaults for a minimal payload', () => {
      const parsed = validator.parseFieldSchema({});
      expect(parsed.fields).toEqual([]);
      expect(parsed.groups).toEqual(['General']);
    });

    it('fills defaults for document sections', () => {
      const parsed = validator.parseDocumentSchema({});
      expect(parsed.sections).toEqual([]);
      expect(parsed.blocks).toEqual([]);
    });

    it('reorders parsed blocks from section membership', () => {
      const first = block({ id: 'b1', label: 'First' });
      const second = block({ id: 'b2', label: 'Second' });
      const parsed = validator.parseDocumentSchema({
        sections: [{ id: 's1', title: 'Top', blockIds: ['b2', 'b1'] }],
        blocks: [first, second],
      });

      expect(parsed.blocks.map((entry) => entry.id)).toEqual(['b2', 'b1']);
    });

    it('rejects a key that is not lower_snake_case', () => {
      expect(() => fields([field('Adult Count')])).toThrow(DomainException);
    });

    it('rejects an unknown block type', () => {
      expect(() => schema([block({ type: 'iframe' })])).toThrow(DomainException);
    });

    it('rejects a non-integer rate in a document line', () => {
      // Minor units are integers by contract — a float rate never reaches the DB.
      expect(() =>
        validator.parseDocumentSchema({ blocks: [block({ content: 'x'.repeat(20_001) })] }),
      ).toThrow(DomainException);
    });
  });

  describe('validate', () => {
    it('accepts a coherent template', () => {
      const report = validator.validate(
        schema([block({ content: 'Trip for {{adults}} guests' })]),
        fields([field('adults')]),
      );
      expect(report.valid).toBe(true);
      expect(report.errors).toEqual([]);
    });

    it('blocks publish when a formula references a deleted field', () => {
      // map.md §86 — this is an error, not a warning.
      const report = validator.validate(
        schema([block()]),
        fields([field('adults')], [{ id: 'x', key: 'total', label: '', expression: 'adults * missing_field' }]),
      );

      expect(report.valid).toBe(false);
      expect(report.errors[0].code).toBe(ErrorCodes.UNKNOWN_VARIABLE_REFERENCE);
    });

    it('blocks publish on a circular formula', () => {
      const report = validator.validate(
        schema([block()]),
        fields(
          [],
          [
            { id: 'a', key: 'a', label: '', expression: 'b + 1' },
            { id: 'b', key: 'b', label: '', expression: 'a + 1' },
          ],
        ),
      );

      expect(report.valid).toBe(false);
      expect(report.errors.some((error) => error.code === ErrorCodes.FORMULA_CIRCULAR_REFERENCE)).toBe(true);
    });

    it('rejects duplicate question keys', () => {
      const report = validator.validate(schema([block()]), fields([field('adults'), field('adults')]));
      expect(report.valid).toBe(false);
    });

    it('rejects a formula key that collides with a question key', () => {
      const report = validator.validate(
        schema([block()]),
        fields([field('total')], [{ id: 'x', key: 'total', label: '', expression: '1 + 1' }]),
      );
      expect(report.valid).toBe(false);
    });

    it('rejects a choice question with no options', () => {
      const report = validator.validate(
        schema([block()]),
        fields([field('tier', { type: 'SELECT' })]),
      );
      expect(report.valid).toBe(false);
    });

    it('warns but does not block on an unknown variable in block content', () => {
      const report = validator.validate(
        schema([block({ content: 'Hello {{nobody_defined_this}}' })]),
        fields(),
      );
      expect(report.valid).toBe(true);
      expect(report.warnings).toHaveLength(1);
    });

    it('blocks publish when a visibility rule points at a missing field', () => {
      const report = validator.validate(
        schema([
          block({
            condition: { mode: 'all', rules: [{ id: 'r1', field: 'gone', operator: 'EQ', value: 'x' }] },
          }),
        ]),
        fields(),
      );
      expect(report.valid).toBe(false);
    });

    it('blocks publish when a generic field block points at a missing question', () => {
      const report = validator.validate(
        schema([
          block({
            type: 'shortTextField',
            label: 'Destination',
            fieldKey: 'destination',
          }),
        ]),
        fields(),
      );

      expect(report.valid).toBe(false);
      expect(report.errors[0].message).toContain('references unknown field "destination"');
    });

    it('blocks publish when a section references an unknown block', () => {
      const report = validator.validate(
        validator.parseDocumentSchema({
          sections: [{ id: 's1', title: 'Intro', blockIds: ['missing'] }],
          blocks: [block()],
        }),
        fields(),
      );
      expect(report.valid).toBe(false);
    });

    it('blocks publish when a block appears in multiple sections', () => {
      const report = validator.validate(
        validator.parseDocumentSchema({
          sections: [
            { id: 's1', title: 'Intro', blockIds: ['b1'] },
            { id: 's2', title: 'Pricing', blockIds: ['b1'] },
          ],
          blocks: [block()],
        }),
        fields(),
      );
      expect(report.valid).toBe(false);
    });

    it('accepts reserved variables the engine always provides', () => {
      const report = validator.validate(schema([block({ content: '{{grand_total}}' })]), fields());
      expect(report.warnings).toEqual([]);
    });

    it('accepts a document-authored template with no legacy blocks', () => {
      const report = validator.validate(schema([]), fields(), '<p>Real document body</p>');
      expect(report.valid).toBe(true);
      expect(report.errors).toEqual([]);
    });

    it('refuses to publish an empty template', () => {
      expect(() => validator.assertPublishable(schema([]), fields())).toThrow(DomainException);
    });

    it('allows publish when the template is authored as a document body', () => {
      expect(() =>
        validator.assertPublishable(schema([]), fields(), '<p>Real document body</p>'),
      ).not.toThrow();
    });
  });

  it('warns when a question re-implements the pricing table', () => {
    const report = validator.validate(
      validator.parseDocumentSchema({ blocks: [{ id: 'b1', type: 'pricingTable' }] }),
      validator.parseFieldSchema({
        fields: [
          { id: 'f1', key: 'base_price', label: 'Base Price', type: 'CURRENCY' },
          { id: 'f2', key: 'discount', label: 'Discount', type: 'NUMBER' },
          { id: 'f3', key: 'destination', label: 'Destination', type: 'TEXT' },
        ],
      }),
    );

    // A warning, never an error: existing templates must keep publishing.
    expect(report.valid).toBe(true);
    const flagged = report.warnings.filter((issue) => issue.message.includes('item table already handles'));
    expect(flagged).toHaveLength(2);
  });
});
