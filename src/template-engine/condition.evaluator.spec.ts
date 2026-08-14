import { ConditionEvaluator, ConditionGroup } from './condition.evaluator';

describe('ConditionEvaluator', () => {
  const evaluator = new ConditionEvaluator();

  const group = (
    mode: 'all' | 'any',
    rules: Array<[string, ConditionGroup['rules'][number]['operator'], string]>,
  ): ConditionGroup => ({
    mode,
    rules: rules.map(([field, operator, value], index) => ({
      id: `r${index}`,
      field,
      operator,
      value,
    })),
  });

  it('treats an absent or empty group as always visible', () => {
    expect(evaluator.evaluate(null, {})).toBe(true);
    expect(evaluator.evaluate({ mode: 'all', rules: [] }, {})).toBe(true);
  });

  it('compares equality case-insensitively', () => {
    expect(evaluator.evaluate(group('all', [['tier', 'EQ', 'deluxe']]), { tier: 'Deluxe' })).toBe(true);
    expect(evaluator.evaluate(group('all', [['tier', 'NEQ', 'deluxe']]), { tier: 'Deluxe' })).toBe(false);
  });

  it('compares numbers numerically, not lexically', () => {
    expect(evaluator.evaluate(group('all', [['nights', 'GT', '9']]), { nights: 10 })).toBe(true);
    expect(evaluator.evaluate(group('all', [['nights', 'LTE', '3']]), { nights: '3' })).toBe(true);
  });

  it('returns false rather than throwing when a numeric rule meets text', () => {
    expect(evaluator.evaluate(group('all', [['nights', 'GT', '2']]), { nights: 'many' })).toBe(false);
  });

  it('supports list and substring operators', () => {
    expect(
      evaluator.evaluate(group('all', [['city', 'IN', 'kochi, munnar, alleppey']]), { city: 'Munnar' }),
    ).toBe(true);
    expect(evaluator.evaluate(group('all', [['notes', 'CONTAINS', 'wheelchair']]), {
      notes: 'Needs wheelchair access',
    })).toBe(true);
  });

  it('treats a missing answer as empty', () => {
    // map.md §22 — a conditional branch that was never shown must behave, not error.
    expect(evaluator.evaluate(group('all', [['visa', 'IS_EMPTY', '']]), {})).toBe(true);
    expect(evaluator.evaluate(group('all', [['visa', 'IS_NOT_EMPTY', '']]), {})).toBe(false);
  });

  it('treats false as empty so unchecked boxes do not count as answered', () => {
    expect(evaluator.evaluate(group('all', [['addon', 'IS_NOT_EMPTY', '']]), { addon: false })).toBe(false);
  });

  it('applies all/any modes', () => {
    const rules = group('all', [
      ['tier', 'EQ', 'deluxe'],
      ['nights', 'GTE', '3'],
    ]);
    expect(evaluator.evaluate(rules, { tier: 'deluxe', nights: 2 })).toBe(false);
    expect(evaluator.evaluate({ ...rules, mode: 'any' }, { tier: 'deluxe', nights: 2 })).toBe(true);
  });

  it('ignores rules that have no field selected yet', () => {
    expect(evaluator.evaluate(group('all', [['', 'EQ', 'x']]), {})).toBe(true);
  });
});
