/**
 * The template a brand-new organisation starts with.
 *
 * A template produces a proposal — narrative and variables, never a price — so
 * these are covering documents, not commercials. Deliberately none of them asks
 * the operator a single question: every value they print comes from reserved
 * variables the engine always supplies (customer, company, dates) or from the
 * document's own notes and terms.
 *
 * Anything an operator would have to type is left out on purpose. A business
 * that wants questions, conditions or formulas builds its own template.
 */

interface StarterBlock {
  id: string;
  type: string;
  label?: string;
  content?: string;
  items?: string[];
  emphasis?: 'normal' | 'strong' | 'muted';
}

export interface StarterTemplate {
  name: string;
  description: string;
  category: string;
  blocks: StarterBlock[];
}

const INTRO: StarterBlock = {
  id: 'intro',
  type: 'text',
  content:
    'Dear {{customer_name}}, thank you for the opportunity. Our proposal is set out below and is valid until {{valid_until}}.',
};

const STANDARD: StarterTemplate = {
  name: 'Standard proposal',
  description: 'A clean proposal: covering note, what you will deliver, your terms.',
  category: 'Proposal',
  blocks: [
    INTRO,
    {
      id: 'deliverables',
      type: 'repeatingList',
      label: "What we'll deliver",
      items: ['Replace these rows with your scope', 'One line per deliverable'],
    },
    { id: 'terms', type: 'terms', label: 'Terms & conditions' },
  ],
};

const TRAVEL: StarterTemplate = {
  name: 'Travel proposal',
  description: 'Covering note, trip summary and terms.',
  category: 'Proposal',
  blocks: [
    INTRO,
    {
      id: 'trip-summary',
      type: 'repeatingList',
      label: 'Trip summary',
      items: ['Destination and dates as agreed', 'Itinerary highlights day by day'],
    },
    { id: 'terms', type: 'terms', label: 'Terms & conditions' },
  ],
};

const PROJECT: StarterTemplate = {
  name: 'Project proposal',
  description: 'Covering note, scope summary and terms.',
  category: 'Proposal',
  blocks: [
    INTRO,
    {
      id: 'scope-summary',
      type: 'repeatingList',
      label: 'Scope summary',
      items: ['Deliverables and assumptions can be listed here', 'One line per work package'],
    },
    { id: 'terms', type: 'terms', label: 'Terms & conditions' },
  ],
};

/** Business-category slug → starter. Anything unmapped gets the standard one. */
const BY_CATEGORY: Record<string, StarterTemplate> = {
  tourism: TRAVEL,
  'wedding-planner': TRAVEL,
  'event-management': TRAVEL,
  'interior-design': PROJECT,
};

export function starterForCategory(slug: string | null | undefined): StarterTemplate {
  return (slug && BY_CATEGORY[slug]) || STANDARD;
}

/** Expands a starter into the `draft` payload `TemplatesService.create` expects. */
export function starterDraft(starter: StarterTemplate) {
  const blocks = starter.blocks.map((block) => ({
    id: block.id,
    type: block.type,
    label: block.label ?? '',
    content: block.content ?? '',
    items: block.items ?? [],
    align: 'left',
    spacing: 'normal',
    emphasis: block.emphasis ?? 'normal',
    condition: null,
  }));

  return {
    schemaJson: {
      sections: [{ id: 'main', title: 'Main content', description: '', blockIds: blocks.map((block) => block.id) }],
      blocks,
    },
    // No questions and no formulas: nothing to answer before the first send.
    fieldSchemaJson: { groups: [], fields: [], formulas: [] },
  };
}
