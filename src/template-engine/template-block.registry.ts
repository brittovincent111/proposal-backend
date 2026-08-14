import { TemplateBlock } from './template.contract';

export interface CompilePackageSnapshot {
  id: string;
  name: string;
  description: string;
  lineIds: string[];
}

export interface TemplateBlockCompileContext {
  packages: CompilePackageSnapshot[];
  meta: {
    terms: string;
    paymentTerms: string;
  };
}

export interface ResolvedBlockSnapshot {
  type: TemplateBlock['type'];
  label: string;
  content: string;
  items: string[];
}

type ContentPresence = 'never' | 'body' | 'items' | 'always';
type DynamicItemsMode = 'append' | 'replaceWhenPresent';

interface TemplateBlockDefinition {
  type: TemplateBlock['type'];
  contentPresence: ContentPresence;
  dynamicItemsMode: DynamicItemsMode;
  dynamicItems?: (context: TemplateBlockCompileContext) => string[];
  dynamicContent?: (context: TemplateBlockCompileContext) => string;
  consumesClosingSection?: 'terms' | 'paymentTerms';
  commercialAnchor?: boolean;
  explicitPageBreak?: boolean;
}

export const boundFieldBlockTypes = [
  'shortTextField',
  'longTextField',
  'numberField',
  'currencyField',
  'dateField',
  'dropdownField',
  'yesNoField',
] as const satisfies readonly TemplateBlock['type'][];

export function isBoundFieldBlockType(
  type: TemplateBlock['type'],
): type is (typeof boundFieldBlockTypes)[number] {
  return boundFieldBlockTypes.includes(type as (typeof boundFieldBlockTypes)[number]);
}

const templateBlockDefinitions = {
  heading: {
    type: 'heading',
    contentPresence: 'body',
    dynamicItemsMode: 'append',
  },
  text: {
    type: 'text',
    contentPresence: 'body',
    dynamicItemsMode: 'append',
  },
  shortTextField: {
    type: 'shortTextField',
    contentPresence: 'body',
    dynamicItemsMode: 'append',
  },
  longTextField: {
    type: 'longTextField',
    contentPresence: 'body',
    dynamicItemsMode: 'append',
  },
  numberField: {
    type: 'numberField',
    contentPresence: 'body',
    dynamicItemsMode: 'append',
  },
  currencyField: {
    type: 'currencyField',
    contentPresence: 'body',
    dynamicItemsMode: 'append',
  },
  dateField: {
    type: 'dateField',
    contentPresence: 'body',
    dynamicItemsMode: 'append',
  },
  dropdownField: {
    type: 'dropdownField',
    contentPresence: 'body',
    dynamicItemsMode: 'append',
  },
  yesNoField: {
    type: 'yesNoField',
    contentPresence: 'body',
    dynamicItemsMode: 'append',
  },
  image: {
    type: 'image',
    contentPresence: 'body',
    dynamicItemsMode: 'append',
  },
  divider: {
    type: 'divider',
    contentPresence: 'never',
    dynamicItemsMode: 'append',
  },
  spacer: {
    type: 'spacer',
    contentPresence: 'never',
    dynamicItemsMode: 'append',
  },
  pageBreak: {
    type: 'pageBreak',
    contentPresence: 'never',
    dynamicItemsMode: 'append',
    explicitPageBreak: true,
  },
  customer: {
    type: 'customer',
    contentPresence: 'body',
    dynamicItemsMode: 'append',
  },
  dynamicField: {
    type: 'dynamicField',
    contentPresence: 'body',
    dynamicItemsMode: 'append',
  },
  table: {
    type: 'table',
    contentPresence: 'items',
    dynamicItemsMode: 'append',
  },
  repeatingList: {
    type: 'repeatingList',
    contentPresence: 'items',
    dynamicItemsMode: 'append',
  },
  pricingTable: {
    type: 'pricingTable',
    contentPresence: 'always',
    dynamicItemsMode: 'append',
    commercialAnchor: true,
  },
  package: {
    type: 'package',
    contentPresence: 'body',
    dynamicItemsMode: 'append',
    dynamicItems: (context) =>
      context.packages.map((entry) =>
        entry.description ? `${entry.name} — ${entry.description}` : entry.name,
      ),
    dynamicContent: (context) => packageSummary(context.packages),
  },
  terms: {
    type: 'terms',
    contentPresence: 'items',
    dynamicItemsMode: 'replaceWhenPresent',
    dynamicItems: (context) => lines(context.meta.terms),
    consumesClosingSection: 'terms',
  },
  payment: {
    type: 'payment',
    contentPresence: 'items',
    dynamicItemsMode: 'replaceWhenPresent',
    dynamicItems: (context) => lines(context.meta.paymentTerms),
    consumesClosingSection: 'paymentTerms',
  },
  gallery: {
    type: 'gallery',
    contentPresence: 'items',
    dynamicItemsMode: 'append',
  },
  reusableBlock: {
    type: 'reusableBlock',
    contentPresence: 'body',
    dynamicItemsMode: 'append',
  },
} satisfies Record<TemplateBlock['type'], TemplateBlockDefinition>;

export function templateBlockDefinition(type: TemplateBlock['type']): TemplateBlockDefinition {
  return templateBlockDefinitions[type];
}

export function resolvedBlockCarriesContent(block: ResolvedBlockSnapshot): boolean {
  const definition = templateBlockDefinition(block.type);

  switch (definition.contentPresence) {
    case 'never':
      return false;
    case 'items':
      return block.items.length > 0;
    case 'always':
      return true;
    default:
      return (
        block.content.trim() !== '' ||
        block.items.length > 0 ||
        block.label.trim() !== ''
      );
  }
}

export function blocksConsumeClosingSections(blocks: ResolvedBlockSnapshot[]) {
  return blocks.reduce<{ terms?: boolean; paymentTerms?: boolean }>((consumed, block) => {
    const key = templateBlockDefinition(block.type).consumesClosingSection;
    if (key && block.items.length > 0) {
      consumed[key] = true;
    }
    return consumed;
  }, { terms: false, paymentTerms: false });
}

function packageSummary(packages: CompilePackageSnapshot[]): string {
  if (!packages.length) return '';
  return packages
    .map((entry) => (entry.description ? `${entry.name}\n${entry.description}` : entry.name))
    .join('\n\n');
}

function lines(value: string | undefined): string[] {
  return (value ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '');
}
