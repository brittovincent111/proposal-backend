import { NARRATIVE_TAG, hasNarrative, narrativeToBlock } from './package-narrative';

describe('package narrative migration', () => {
  const pkg = (overrides: Record<string, unknown> = {}) => ({
    name: 'Kerala 4N/5D',
    category: 'Travel',
    itinerary: [],
    inclusions: [],
    exclusions: [],
    ...overrides,
  });

  it('leaves a package with nothing to move alone', () => {
    expect(hasNarrative(pkg())).toBe(false);
    expect(narrativeToBlock(pkg())).toBeNull();
  });

  it('ignores whitespace-only rows rather than creating an empty block', () => {
    const source = pkg({ inclusions: ['  ', ''], exclusions: ['\t'] });
    expect(hasNarrative(source)).toBe(false);
    expect(narrativeToBlock(source)).toBeNull();
  });

  it('moves inclusions and exclusions into one saved block', () => {
    const migration = narrativeToBlock(
      pkg({ inclusions: ['Houseboat stay', ' Daily breakfast '], exclusions: ['Airfare'] }),
    );

    expect(migration?.name).toBe('Kerala 4N/5D — details');
    expect(migration?.category).toBe('Travel');
    expect(migration?.tags).toEqual([NARRATIVE_TAG]);
    expect(migration?.blockJson.blocks.map((block) => block.type)).toEqual([
      'repeatingList',
      'repeatingList',
    ]);
    expect(migration?.blockJson.blocks[0].items).toEqual(['Houseboat stay', 'Daily breakfast']);
  });

  /**
   * The rows must match what the compiler used to build from the package, or a
   * migrated package would print a different document than before.
   */
  it('renders itinerary days exactly as the compiler did', () => {
    const migration = narrativeToBlock(
      pkg({
        itinerary: [
          { day: 1, title: 'Arrive Kochi', summary: 'Fort Kochi walk', highlights: ['Chinese nets'] },
          { day: 2, title: '', summary: '', highlights: [] },
        ],
      }),
    );

    expect(migration?.blockJson.blocks[0].items).toEqual([
      'Day 1 — Arrive Kochi: Fort Kochi walk',
      '• Chinese nets',
      'Day 2 — Untitled day',
    ]);
  });

  it('keeps block order stable: itinerary, then inclusions, then exclusions', () => {
    const migration = narrativeToBlock(
      pkg({
        itinerary: [{ day: 1, title: 'Day one' }],
        inclusions: ['Breakfast'],
        exclusions: ['Airfare'],
      }),
    );

    expect(migration?.blockJson.blocks.map((block) => block.type)).toEqual([
      'repeatingList',
      'repeatingList',
      'repeatingList',
    ]);
  });

  it('falls back to General when the package has no category', () => {
    expect(narrativeToBlock(pkg({ category: '  ', inclusions: ['x'] }))?.category).toBe('General');
  });

  it('produces blocks the template block schema accepts', () => {
    const migration = narrativeToBlock(pkg({ inclusions: ['Breakfast'] }));
    const [block] = migration!.blockJson.blocks;

    // Same field set a template stores, so the block drops straight in.
    expect(Object.keys(block).sort()).toEqual(
      ['align', 'condition', 'content', 'emphasis', 'id', 'items', 'label', 'refId', 'spacing', 'type', 'width'].sort(),
    );
  });
});
