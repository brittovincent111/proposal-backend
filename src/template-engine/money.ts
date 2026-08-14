/**
 * Money is an integer number of minor units (paise, cents). Every multiplication
 * and division routes through BigInt so no intermediate value is ever a float —
 * map.md §20 forbids floating-point money arithmetic.
 *
 * This mirrors the frontend's `src/lib/pricing/money.ts` deliberately: the client
 * may preview a total, but the value persisted is always the one computed here.
 */

export type Minor = number;

/** Quantities are decimal (2.5 hours, 8.25 sq ft) and scaled to integers internally. */
const QTY_SCALE = 1_000_000n;

function assertFinite(value: number, label: string): number {
  if (!Number.isFinite(value)) throw new RangeError(`${label} must be a finite number`);
  return value;
}

/** Half-up rounding on a BigInt quotient, matching how invoices round. */
function divRound(numerator: bigint, denominator: bigint): bigint {
  if (denominator === 0n) throw new RangeError('division by zero');
  const negative = numerator < 0n !== denominator < 0n;
  const a = numerator < 0n ? -numerator : numerator;
  const b = denominator < 0n ? -denominator : denominator;
  const quotient = a / b;
  const remainder = a % b;
  const rounded = remainder * 2n >= b ? quotient + 1n : quotient;
  return negative ? -rounded : rounded;
}

function scaleDecimal(value: number, scale: bigint): bigint {
  // Fixed-point string conversion avoids 0.1 + 0.2 style drift.
  const digits = scale.toString().length - 1;
  const fixed = assertFinite(value, 'value').toFixed(digits);
  const negative = fixed.startsWith('-');
  const [whole, fraction = ''] = (negative ? fixed.slice(1) : fixed).split('.');
  const magnitude = BigInt(whole) * scale + BigInt(fraction.padEnd(digits, '0') || '0');
  return negative ? -magnitude : magnitude;
}

/** Major units (₹1,250.50) → minor units (125050). */
export function toMinor(major: number): Minor {
  return Number(scaleDecimal(major, 100n));
}

export function fromMinor(minor: Minor): number {
  return minor / 100;
}

/** amount × quantity, where quantity may be decimal. */
export function multiplyQuantity(amount: Minor, quantity: number): Minor {
  const scaled = scaleDecimal(quantity, QTY_SCALE);
  return Number(divRound(BigInt(Math.trunc(amount)) * scaled, QTY_SCALE));
}

/** A percentage of an amount, e.g. an 18% tax or a 12.5% discount. */
export function percentOf(amount: Minor, percent: number): Minor {
  const scaled = scaleDecimal(percent, QTY_SCALE);
  return Number(divRound(BigInt(Math.trunc(amount)) * scaled, QTY_SCALE * 100n));
}

/**
 * The tax already baked into a tax-inclusive amount:
 * amount − amount × 100 / (100 + percent).
 */
export function taxWithin(amount: Minor, percent: number): Minor {
  if (percent === 0) return 0;
  const scaledPercent = scaleDecimal(percent, QTY_SCALE);
  const base = divRound(
    BigInt(Math.trunc(amount)) * QTY_SCALE * 100n,
    QTY_SCALE * 100n + scaledPercent,
  );
  return Number(BigInt(Math.trunc(amount)) - base);
}

/** Splits an amount across n shares whose total is exactly the original (largest remainder). */
export function distribute(amount: Minor, weights: Minor[]): Minor[] {
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  if (total <= 0) return weights.map(() => 0);

  const exact = weights.map(
    (weight) => (BigInt(Math.trunc(amount)) * BigInt(weight)) / BigInt(total),
  );
  const shares = exact.map(Number);
  let remainder = amount - shares.reduce((sum, share) => sum + share, 0);

  // Hand the leftover minor units to the largest weights first.
  const order = weights
    .map((weight, index) => ({ weight, index }))
    .sort((a, b) => b.weight - a.weight);

  let cursor = 0;
  while (remainder > 0 && order.length > 0) {
    shares[order[cursor % order.length].index] += 1;
    remainder -= 1;
    cursor += 1;
  }
  return shares;
}

/** Rounds to the nearest whole major unit; returns the delta so it can be shown as a line. */
export function roundOffDelta(amount: Minor): Minor {
  const remainder = ((amount % 100) + 100) % 100;
  if (remainder === 0) return 0; // guard against -0, which would render as "-0"
  return remainder >= 50 ? 100 - remainder : -remainder;
}

export function clampNonNegative(amount: Minor): Minor {
  return amount < 0 ? 0 : amount;
}

export function formatMinor(minor: Minor, currency = 'INR', locale = 'en-IN'): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(fromMinor(minor));
}
