import { RevisionDiffService } from './revision-diff.service';

describe('RevisionDiffService', () => {
  const diffs = new RevisionDiffService();

  const snapshot = (
    answers: Record<string, unknown>,
    lines: Array<{ name: string; quantity?: number; rate?: number; optional?: boolean; selected?: boolean }>,
    grandTotal: number,
  ) => ({
    inputValuesJson: answers,
    pricingSnapshotJson: {
      sections: [
        {
          id: 's1',
          title: 'Items',
          lines: lines.map((line, index) => ({
            id: `l${index}`,
            kind: 'ITEM',
            name: line.name,
            unit: 'nos',
            quantity: line.quantity ?? 1,
            rate: line.rate ?? 0,
            optional: line.optional ?? false,
            selected: line.selected ?? true,
          })),
        },
      ],
    },
    grandTotal,
    subtotal: grandTotal,
    discountTotal: 0,
    taxTotal: 0,
  });

  it('labels the first revision instead of diffing against nothing', () => {
    const diff = diffs.compare(null, snapshot({}, [], 0));
    expect(diff.summary).toEqual(['First revision.']);
  });

  it('reports a quantity change in customer-readable terms', () => {
    // The worked example from map.md §27.
    const before = snapshot({}, [{ name: 'Camera', quantity: 16, rate: 500_000 }], 14_200_000);
    const after = snapshot({}, [{ name: 'Camera', quantity: 12, rate: 500_000 }], 12_100_000);

    const diff = diffs.compare(before, after);

    expect(diff.lines).toContainEqual({ label: 'Camera quantity', from: '16 nos', to: '12 nos' });
    expect(diff.totals[0].label).toBe('Total');
  });

  it('reports added and removed lines', () => {
    const diff = diffs.compare(
      snapshot({}, [{ name: 'NVR' }], 0),
      snapshot({}, [{ name: 'Cable', rate: 1000 }], 0),
    );

    expect(diff.lines.map((entry) => entry.label).sort()).toEqual(['Cable', 'NVR']);
  });

  it('reports an optional line being toggled in', () => {
    const diff = diffs.compare(
      snapshot({}, [{ name: 'Drone shoot', optional: true, selected: false }], 0),
      snapshot({}, [{ name: 'Drone shoot', optional: true, selected: true }], 0),
    );

    expect(diff.lines[0]).toEqual({
      label: 'Drone shoot (optional)',
      from: 'excluded',
      to: 'included',
    });
  });

  it('reports changed answers with humanised labels', () => {
    const diff = diffs.compare(
      snapshot({ hotel_category: '3 star' }, [], 0),
      snapshot({ hotel_category: '4 star' }, [], 0),
    );

    expect(diff.answers[0]).toEqual({ label: 'Hotel Category', from: '3 star', to: '4 star' });
  });

  it('says so plainly when nothing measurable changed', () => {
    const same = snapshot({ a: 1 }, [{ name: 'X', rate: 100 }], 100);
    expect(diffs.compare(same, same).summary).toEqual(['No measurable changes.']);
  });
});
