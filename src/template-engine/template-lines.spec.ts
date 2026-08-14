import { FormulaEngine } from './formula.engine';
import { TemplateSchemaValidator } from './template-schema.validator';

/**
 * Default lines are what make the Packages module optional: a business with one
 * layout and one standard set of lines never has to open it. They are parsed from
 * free-form JSON like everything else on a template version, so the contract is
 * worth pinning down.
 */
describe('template default lines', () => {
  const validator = new TemplateSchemaValidator(new FormulaEngine());

  it('treats a template with no lines as empty rather than failing', () => {
    expect(validator.parseTemplateLines(undefined).lines).toEqual([]);
    expect(validator.parseTemplateLines({}).lines).toEqual([]);
  });

  it('fills the defaults a line editor would otherwise have to send', () => {
    const parsed = validator.parseTemplateLines({
      lines: [{ lineId: 'l1', name: 'Site survey' }],
    });

    expect(parsed.lines[0]).toMatchObject({
      name: 'Site survey',
      unit: 'nos',
      quantity: 1,
      rate: 0,
      itemId: null,
      taxRateId: null,
      optional: false,
    });
  });

  it('keeps rates in minor units and rejects a fractional one', () => {
    expect(() =>
      validator.parseTemplateLines({ lines: [{ lineId: 'l1', name: 'x', rate: 12.5 }] }),
    ).toThrow('Invalid template lines.');
  });

  it('refuses a negative rate or quantity', () => {
    expect(() =>
      validator.parseTemplateLines({ lines: [{ lineId: 'l1', name: 'x', rate: -100 }] }),
    ).toThrow('Invalid template lines.');
    expect(() =>
      validator.parseTemplateLines({ lines: [{ lineId: 'l1', name: 'x', quantity: -1 }] }),
    ).toThrow('Invalid template lines.');
  });

  it('caps the list so a template cannot carry an unbounded draft', () => {
    const lines = Array.from({ length: 201 }, (_, index) => ({
      lineId: `l${index}`,
      name: `Line ${index}`,
    }));

    expect(() => validator.parseTemplateLines({ lines })).toThrow('Invalid template lines.');
  });

  it('accepts a realistic set unchanged', () => {
    const parsed = validator.parseTemplateLines({
      lines: [
        { lineId: 'l1', name: 'Dome camera 4MP', unit: 'nos', quantity: 3, rate: 320_000 },
        { lineId: 'l2', name: '8 channel NVR', unit: 'nos', quantity: 1, rate: 1_150_000 },
        { lineId: 'l3', name: 'Installation', unit: 'job', quantity: 1, rate: 1_200_000, optional: true },
      ],
    });

    expect(parsed.lines).toHaveLength(3);
    expect(parsed.lines[2].optional).toBe(true);
    expect(parsed.lines.reduce((total, line) => total + line.quantity * line.rate, 0)).toBe(3_310_000);
  });
});
