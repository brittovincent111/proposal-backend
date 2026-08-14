import {
  distribute,
  fromMinor,
  multiplyQuantity,
  percentOf,
  roundOffDelta,
  taxWithin,
  toMinor,
} from './money';

describe('money', () => {
  it('converts major units without floating point drift', () => {
    expect(toMinor(1250.5)).toBe(125050);
    expect(toMinor(0.1 + 0.2)).toBe(30);
    expect(toMinor(19.99)).toBe(1999);
    expect(fromMinor(125050)).toBe(1250.5);
  });

  it('multiplies by decimal quantities exactly', () => {
    expect(multiplyQuantity(10_000, 2.5)).toBe(25_000);
    expect(multiplyQuantity(33_333, 3)).toBe(99_999);
    // 8.25 sq ft at ₹123.45 — the classic case that drifts with floats.
    expect(multiplyQuantity(12_345, 8.25)).toBe(101_846);
  });

  it('computes percentages with half-up rounding', () => {
    expect(percentOf(100_000, 18)).toBe(18_000);
    expect(percentOf(1, 50)).toBe(1); // 0.5 rounds up
    expect(percentOf(100_000, 12.5)).toBe(12_500);
  });

  it('extracts tax already contained in an inclusive amount', () => {
    // ₹1,180 inclusive of 18% contains ₹180 of tax.
    expect(taxWithin(118_000, 18)).toBe(18_000);
    expect(taxWithin(100_000, 0)).toBe(0);
  });

  it('distributes an amount so the shares sum to the original', () => {
    const shares = distribute(100, [33, 33, 34]);
    expect(shares.reduce((sum, share) => sum + share, 0)).toBe(100);

    const uneven = distribute(10, [1, 1, 1]);
    expect(uneven.reduce((sum, share) => sum + share, 0)).toBe(10);
  });

  it('returns zero shares when every weight is zero', () => {
    expect(distribute(500, [0, 0])).toEqual([0, 0]);
  });

  it('rounds to the nearest whole major unit', () => {
    expect(roundOffDelta(10_049)).toBe(-49);
    expect(roundOffDelta(10_050)).toBe(50);
    expect(roundOffDelta(10_000)).toBe(0);
  });
});
