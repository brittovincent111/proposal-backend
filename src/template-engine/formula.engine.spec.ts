import { FormulaEngine } from './formula.engine';

describe('FormulaEngine', () => {
  const engine = new FormulaEngine();

  describe('analyze', () => {
    it('accepts arithmetic over field references', () => {
      const result = engine.analyze('(adults + children) * per_head');
      expect(result.error).toBeNull();
      expect(result.refs.sort()).toEqual(['adults', 'children', 'per_head']);
    });

    it('rejects anything outside the arithmetic whitelist', () => {
      // map.md §76: no arbitrary code, so anything that could reach a runtime
      // must fail at parse time rather than at evaluation.
      expect(engine.analyze('process.exit(1)').error).not.toBeNull();
      expect(engine.analyze('1; alert(1)').error).toContain('not allowed');
      expect(engine.analyze('a["b"]').error).toContain('not allowed');
      expect(engine.analyze('a && b').error).toContain('not allowed');
      expect(engine.analyze('`${x}`').error).toContain('not allowed');
    });

    it('rejects malformed expressions', () => {
      expect(engine.analyze('2 +').error).toBe('Expression is incomplete.');
      expect(engine.analyze('(2 + 3').error).toBe('Unbalanced parentheses.');
      expect(engine.analyze('').error).toBe('Expression is empty.');
    });
  });

  describe('evaluate', () => {
    it('respects operator precedence and parentheses', () => {
      expect(engine.evaluate('2 + 3 * 4', {}).value).toBe(14);
      expect(engine.evaluate('(2 + 3) * 4', {}).value).toBe(20);
      expect(engine.evaluate('-5 + 10', {}).value).toBe(5);
      expect(engine.evaluate('10 % 3', {}).value).toBe(1);
    });

    it('substitutes scope values', () => {
      expect(engine.evaluate('nights * rate', { nights: 3, rate: 4500 }).value).toBe(13_500);
    });

    it('reports an unknown reference instead of treating it as zero', () => {
      const result = engine.evaluate('nights * rate', { nights: 3 });
      expect(result.value).toBeNull();
      expect(result.error).toContain('rate');
    });

    it('refuses to divide by zero', () => {
      expect(engine.evaluate('10 / 0', {}).error).toBe('Division by zero.');
    });
  });

  describe('findCycles', () => {
    it('finds mutually referencing formulas', () => {
      const cycles = engine.findCycles([
        { key: 'a', expression: 'b + 1' },
        { key: 'b', expression: 'a + 1' },
      ]);
      expect(cycles.sort()).toEqual(['a', 'b']);
    });

    it('finds self-reference', () => {
      expect(engine.findCycles([{ key: 'a', expression: 'a + 1' }])).toEqual(['a']);
    });

    it('accepts a valid dependency chain', () => {
      expect(
        engine.findCycles([
          { key: 'subtotal', expression: 'nights * rate' },
          { key: 'tax', expression: 'subtotal * 0.18' },
        ]),
      ).toEqual([]);
    });
  });

  describe('resolve', () => {
    it('evaluates in dependency order regardless of declaration order', () => {
      const scope = engine.resolve(
        [
          { key: 'tax', expression: 'base * 0.18' },
          { key: 'base', expression: 'nights * rate' },
          { key: 'total', expression: 'base + tax' },
        ],
        { nights: 3, rate: 1000 },
      );

      expect(scope.base).toBe(3000);
      expect(scope.tax).toBe(540);
      expect(scope.total).toBe(3540);
    });

    it('coerces numeric strings and booleans from answers', () => {
      const scope = engine.resolve([{ key: 'doubled', expression: 'count * 2' }], {
        count: '7',
        flag: true,
      });
      expect(scope.doubled).toBe(14);
      expect(scope.flag).toBe(1);
    });

    it('skips cyclic formulas rather than looping forever', () => {
      const scope = engine.resolve(
        [
          { key: 'a', expression: 'b + 1' },
          { key: 'b', expression: 'a + 1' },
          { key: 'safe', expression: '2 * 2' },
        ],
        {},
      );
      expect(scope.safe).toBe(4);
      expect(scope.a).toBeUndefined();
    });
  });
});
