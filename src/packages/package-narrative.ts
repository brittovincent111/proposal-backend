/**
 * Moves a package's narrative content into a saved block.
 *
 * A package earns its place by carrying priced lines and a pricing mode — a
 * template cannot hold those. Its itinerary, inclusions and exclusions are a
 * different thing entirely: document *content*, which is what saved blocks are
 * for. Keeping them on the package meant the same words could live in three
 * places (package, template block, quotation) with nothing to say which won.
 *
 * This is the pure half of that migration, so the mapping is testable without a
 * database. The CLI in `src/packages/migrate-package-narrative.cli.ts` applies it.
 */

export interface NarrativeSource {
  name: string;
  category?: string;
  itinerary?: Array<{ day: number; title?: string; summary?: string; highlights?: string[] }>;
  inclusions?: string[];
  exclusions?: string[];
}

export interface NarrativeBlock {
  id: string;
  type: 'repeatingList';
  label: string;
  content: string;
  refId: string;
  items: string[];
  width: 'full';
  align: 'left';
  spacing: 'normal';
  emphasis: 'normal';
  condition: null;
}

export interface NarrativeMigration {
  name: string;
  description: string;
  category: string;
  tags: string[];
  blockJson: { blocks: NarrativeBlock[] };
}

/** Marks the blocks this migration created, so a re-run can recognise its own work. */
export const NARRATIVE_TAG = 'from-package';

/**
 * Renders one itinerary day as list rows.
 *
 * Matches what the compiler already produced for an itinerary block, so a
 * migrated package prints exactly the same document as before.
 */
function itineraryRows(days: NarrativeSource['itinerary']): string[] {
  return (days ?? []).flatMap((day) => {
    const headline = `Day ${day.day} — ${day.title?.trim() || 'Untitled day'}`;
    const highlights = (day.highlights ?? [])
      .map((highlight) => highlight.trim())
      .filter(Boolean)
      .map((highlight) => `• ${highlight}`);

    const summary = day.summary?.trim();
    return summary ? [`${headline}: ${summary}`, ...highlights] : [headline, ...highlights];
  });
}

function clean(values: string[] | undefined): string[] {
  return (values ?? []).map((value) => value.trim()).filter(Boolean);
}

function block(
  label: string,
  items: string[],
): NarrativeBlock {
  return {
    id: `repeating-list-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
    type: 'repeatingList',
    label,
    content: '',
    refId: '',
    items,
    width: 'full',
    align: 'left',
    spacing: 'normal',
    emphasis: 'normal',
    condition: null,
  };
}

export function hasNarrative(source: NarrativeSource): boolean {
  return (
    itineraryRows(source.itinerary).length > 0 ||
    clean(source.inclusions).length > 0 ||
    clean(source.exclusions).length > 0
  );
}

/**
 * The saved block a package's narrative becomes, or null when there is nothing
 * to move — which is the common case and must not create an empty library entry.
 */
export function narrativeToBlock(source: NarrativeSource): NarrativeMigration | null {
  if (!hasNarrative(source)) return null;

  const blocks: NarrativeBlock[] = [];
  const itinerary = itineraryRows(source.itinerary);
  const inclusions = clean(source.inclusions);
  const exclusions = clean(source.exclusions);

  if (itinerary.length) blocks.push(block('Day-by-day plan', itinerary));
  if (inclusions.length) blocks.push(block("What's included", inclusions));
  if (exclusions.length) blocks.push(block('Not included', exclusions));

  return {
    name: `${source.name} — details`,
    description: `Itinerary, inclusions and exclusions moved out of the “${source.name}” package.`,
    category: source.category?.trim() || 'General',
    tags: [NARRATIVE_TAG],
    blockJson: { blocks },
  };
}
