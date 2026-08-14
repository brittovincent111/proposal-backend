import { PackageResolver } from './package.resolver';
import { ReusableBlockResolver } from './reusable-block.resolver';

/**
 * Both resolvers existed before anything called them: a PACKAGE_SELECT answer
 * printed the package's name as text, and a saved block could not be referenced
 * from a template at all. These lock in the behaviour the wiring depends on.
 */
describe('ReusableBlockResolver', () => {
  const resolver = new ReusableBlockResolver();

  const block = (overrides: Record<string, unknown> = {}) => ({
    id: 'blk-1',
    type: 'text',
    label: 'Standard Inclusions',
    content: 'Breakfast, transfers and local support.',
    refId: '',
    items: [],
    align: 'left',
    spacing: 'normal',
    emphasis: 'normal',
    condition: null,
    ...overrides,
  });

  it('expands a library entry into its blocks', () => {
    const resolved = resolver.resolve({
      id: 'lib-1',
      name: 'Standard Inclusions',
      blockJson: { blocks: [block(), block({ id: 'blk-2', type: 'repeatingList' })] },
    });

    expect(resolved).toHaveLength(2);
    expect(resolved[0].content).toBe('Breakfast, transfers and local support.');
    expect(resolved[1].type).toBe('repeatingList');
  });

  it('skips an entry whose blocks no longer parse instead of failing generation', () => {
    const resolved = resolver.resolve({
      id: 'lib-2',
      name: 'Half broken',
      blockJson: { blocks: [block(), { type: 'nonsense' }] },
    });

    expect(resolved).toHaveLength(1);
  });

  it('returns nothing for an empty library entry', () => {
    expect(resolver.resolve({ id: 'lib-3', name: 'Empty', blockJson: {} })).toEqual([]);
  });
});

describe('PackageResolver', () => {
  const resolver = new PackageResolver();

  const entry = (overrides: Partial<Parameters<PackageResolver['resolve']>[0]> = {}) => ({
    id: 'pkg-1',
    name: 'Kerala 5D/4N',
    description: 'Munnar, Thekkady, Alleppey',
    pricingMode: 'SUM_OF_ITEMS' as const,
    fixedPrice: 0,
    discountPercent: 0,
    lines: [
      {
        itemId: null,
        name: 'Houseboat',
        description: '',
        unit: 'night',
        quantity: 1,
        rate: 12_000,
        taxRateId: null,
        optional: false,
      },
      {
        itemId: null,
        name: 'Sedan',
        description: '',
        unit: 'day',
        quantity: 4,
        rate: 3_000,
        taxRateId: null,
        optional: true,
      },
    ],
    ...overrides,
  });

  it('copies each package line by value and stamps the package it came from', () => {
    const lines = resolver.resolve(entry(), 'tax-1');

    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatchObject({ name: 'Houseboat', rate: 12_000, packageId: 'pkg-1', taxRateId: 'tax-1' });
    expect(lines[1]).toMatchObject({ name: 'Sedan', quantity: 4, optional: true });
  });

  it('quotes a fixed-price package as a single line listing its components', () => {
    const lines = resolver.resolve(entry({ pricingMode: 'FIXED_PRICE', fixedPrice: 45_000 }), null);

    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ name: 'Kerala 5D/4N', rate: 45_000, unit: 'package' });
    expect(lines[0].description).toBe('Houseboat, Sedan');
  });

  it('carries the discount onto every line of a discounted package', () => {
    const lines = resolver.resolve(entry({ pricingMode: 'DISCOUNTED_TOTAL', discountPercent: 10 }), null);

    expect(lines.every((line) => line.discount.mode === 'PERCENT' && line.discount.value === 10)).toBe(true);
  });
});
