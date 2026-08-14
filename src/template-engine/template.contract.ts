import { z } from 'zod';

import { ConditionOperators } from './condition.evaluator';
import { DiscountModes, LineKinds, PricingModes } from './pricing.types';

/**
 * Runtime contract for everything that arrives as free-form JSON — map.md §45.
 *
 * TypeScript types are erased at runtime, so template/document JSON coming from
 * a client is parsed through zod before it is allowed anywhere near the database.
 */

export const SCHEMA_VERSION = 1;

export const KEY_PATTERN = /^[a-z][a-z0-9_]*$/;

export const conditionGroupSchema = z.object({
  mode: z.enum(['all', 'any']),
  rules: z
    .array(
      z.object({
        id: z.string().min(1).max(64),
        field: z.string().max(64),
        operator: z.enum(ConditionOperators),
        value: z.string().max(500).default(''),
      }),
    )
    .max(50),
});

export const FieldTypes = [
  'TEXT',
  'TEXTAREA',
  'NUMBER',
  'CURRENCY',
  'DATE',
  'DATETIME',
  'BOOLEAN',
  'SELECT',
  'MULTI_SELECT',
  'IMAGE',
  'FILE',
  'CUSTOMER',
  'EMAIL',
  'PHONE',
  'URL',
  'PERCENTAGE',
  'PACKAGE_SELECT',
  'BLOCK_SELECT',
  'ITEM_LIST',
] as const;
export type FieldType = (typeof FieldTypes)[number];

export const OPTION_FIELD_TYPES: FieldType[] = [
  'SELECT',
  'MULTI_SELECT',
  'PACKAGE_SELECT',
  'BLOCK_SELECT',
];
export const NUMERIC_FIELD_TYPES: FieldType[] = ['NUMBER', 'CURRENCY', 'PERCENTAGE'];

export const fieldSchema = z.object({
  id: z.string().min(1).max(64),
  key: z.string().regex(KEY_PATTERN, 'Keys must be lower_snake_case and start with a letter.').max(64),
  label: z.string().min(1).max(200),
  description: z.string().max(1000).default(''),
  type: z.enum(FieldTypes),
  group: z.string().max(120).default('General'),
  required: z.boolean().default(false),
  placeholder: z.string().max(200).default(''),
  defaultValue: z.string().max(1000).default(''),
  options: z.array(z.string().max(200)).max(200).default([]),
  condition: conditionGroupSchema.nullable().default(null),
});
export type TemplateField = z.infer<typeof fieldSchema>;

export const formulaSchema = z.object({
  id: z.string().min(1).max(64),
  key: z.string().regex(KEY_PATTERN).max(64),
  label: z.string().max(200).default(''),
  expression: z.string().max(2000),
});
export type TemplateFormula = z.infer<typeof formulaSchema>;

export const BlockTypes = [
  'heading',
  'text',
  'shortTextField',
  'longTextField',
  'numberField',
  'currencyField',
  'dateField',
  'dropdownField',
  'yesNoField',
  'image',
  'divider',
  'spacer',
  'pageBreak',
  'customer',
  'dynamicField',
  'table',
  'repeatingList',
  'pricingTable',
  'package',
  'terms',
  'payment',
  'gallery',
  // A placeholder for a library block (map.md §15). It never reaches a rendered
  // document: generation replaces it with a snapshot of the library block's own
  // blocks, so editing the library later cannot alter a document already issued.
  'reusableBlock',
] as const;
export type BlockType = (typeof BlockTypes)[number];

export const blockSchema = z.object({
  id: z.string().min(1).max(64),
  type: z.enum(BlockTypes),
  label: z.string().max(200).default(''),
  content: z.string().max(20_000).default(''),
  fieldKey: z.string().regex(KEY_PATTERN).max(64).or(z.literal('')).default(''),
  /** Which library block a 'reusableBlock' placeholder stands for. */
  refId: z.string().max(64).default(''),
  /**
   * Starts this block on a fresh page when printed.
   *
   * Cheaper than a separate pageBreak block for the common case — "the proposal
   * reads as one document, the prices start on their own page" — because the break
   * belongs to the block it precedes and moves with it.
   */
  newPage: z.boolean().default(false),
  items: z.array(z.string().max(2000)).max(500).default([]),
  width: z.enum(['full', 'half', 'third']).default('full'),
  align: z.enum(['left', 'center', 'right']).default('left'),
  spacing: z.enum(['compact', 'normal', 'roomy']).default('normal'),
  emphasis: z.enum(['normal', 'strong', 'muted']).default('normal'),
  condition: conditionGroupSchema.nullable().default(null),
});
export type TemplateBlock = z.infer<typeof blockSchema>;

export const templateSectionSchema = z.object({
  id: z.string().min(1).max(64),
  title: z.string().max(200).default('Section'),
  description: z.string().max(2000).default(''),
  blockIds: z.array(z.string().min(1).max(64)).max(500).default([]),
});
export type TemplateSection = z.infer<typeof templateSectionSchema>;

/** The document body: an ordered list of blocks. Structure lives in JSON, not tables (map.md §9). */
export const documentSchemaJson = z.object({
  schemaVersion: z.number().int().positive().default(SCHEMA_VERSION),
  sections: z.array(templateSectionSchema).max(100).default([]),
  blocks: z.array(blockSchema).max(500).default([]),
});
export type DocumentSchemaJson = z.infer<typeof documentSchemaJson>;

/** The questions the operator answers, plus derived values. */
export const fieldSchemaJson = z.object({
  schemaVersion: z.number().int().positive().default(SCHEMA_VERSION),
  groups: z.array(z.string().max(120)).max(50).default(['General']),
  fields: z.array(fieldSchema).max(300).default([]),
  formulas: z.array(formulaSchema).max(200).default([]),
});
export type FieldSchemaJson = z.infer<typeof fieldSchemaJson>;

export const styleSchemaJson = z.object({
  accentColor: z.string().max(32).default('#2563eb'),
  fontFamily: z.string().max(120).default('Inter'),
  pageSize: z.enum(['A4', 'LETTER']).default('A4'),
  headerText: z.string().max(500).default(''),
  footerText: z.string().max(500).default(''),
  showLogo: z.boolean().default(true),
  showPageNumbers: z.boolean().default(true),
});
export type StyleSchemaJson = z.infer<typeof styleSchemaJson>;

export const discountSchema = z.object({
  mode: z.enum(DiscountModes),
  value: z.number().min(0).max(1_000_000_000),
});

export const documentLineSchema = z.object({
  id: z.string().min(1).max(64),
  kind: z.enum(LineKinds),
  itemId: z.string().max(64).nullish(),
  packageId: z.string().max(64).nullish(),
  packageName: z.string().max(200).default(''),
  name: z.string().max(500).default(''),
  description: z.string().max(5000).default(''),
  unit: z.string().max(50).default('nos'),
  pricingMode: z.enum(PricingModes).default('QUANTITY_RATE'),
  quantity: z.number().min(0).max(1_000_000).default(1),
  days: z.number().min(0).max(100_000).default(1),
  // Minor units: integers only, so a float rate can never reach the database.
  rate: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).default(0),
  percent: z.number().min(0).max(100).default(0),
  formula: z.string().max(2000).default(''),
  manualAmount: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).default(0),
  discount: discountSchema.default({ mode: 'PERCENT', value: 0 }),
  taxRateId: z.string().max(64).nullable().default(null),
  optional: z.boolean().default(false),
  selected: z.boolean().default(true),
});

export const documentSectionSchema = z.object({
  id: z.string().min(1).max(64),
  title: z.string().max(200).default('Items'),
  lines: z.array(documentLineSchema).max(1000).default([]),
});

export const extraChargeSchema = z.object({
  id: z.string().min(1).max(64),
  label: z.string().max(200),
  amount: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
});

/**
 * Line items a template starts a quotation with — map.md §16 applied to templates
 * rather than packages.
 *
 * These make Packages optional: a business with one layout and one standard set
 * of lines never has to open the packages module. Copied by value into the draft
 * at creation, exactly as a package is, so editing the template afterwards cannot
 * alter a quotation that already used it.
 */
export const templateLineSchema = z.object({
  lineId: z.string().min(1).max(64),
  itemId: z.string().max(64).nullable().default(null),
  syncToCatalog: z.boolean().default(false),
  name: z.string().max(300),
  description: z.string().max(2000).default(''),
  unit: z.string().max(40).default('nos'),
  quantity: z.number().min(0).max(1_000_000).default(1),
  /** Minor units, matching every other rate in the system. */
  rate: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).default(0),
  taxRateId: z.string().max(64).nullable().default(null),
  optional: z.boolean().default(false),
});
export type TemplateLine = z.infer<typeof templateLineSchema>;

export const templateLinesJson = z.object({
  schemaVersion: z.number().int().positive().default(SCHEMA_VERSION),
  lines: z.array(templateLineSchema).max(200).default([]),
});
export type TemplateLinesJson = z.infer<typeof templateLinesJson>;

export const templateDefaultPackageSchema = z.object({
  id: z.string().min(1).max(64),
  sourcePackageId: z.string().max(64).nullable().default(null),
  syncToCatalog: z.boolean().default(false),
  name: z.string().max(300),
  description: z.string().max(5000).default(''),
  category: z.string().max(120).default('General'),
  pricingMode: z.enum(['SUM_OF_ITEMS', 'FIXED_PRICE', 'DISCOUNTED_TOTAL']).default('SUM_OF_ITEMS'),
  fixedPrice: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).default(0),
  discountPercent: z.number().min(0).max(100).default(0),
  lines: z.array(templateLineSchema).max(200).default([]),
});
export type TemplateDefaultPackage = z.infer<typeof templateDefaultPackageSchema>;

export const templateSettingsJson = z.object({
  defaultValidityDays: z.number().int().min(1).max(365).nullable().default(null),
  defaultTaxInclusive: z.boolean().nullable().default(null),
  defaultRoundOff: z.boolean().nullable().default(null),
  defaultTerms: z.string().max(20_000).default(''),
  defaultPaymentTerms: z.string().max(20_000).default(''),
  defaultPackageIds: z.array(z.string().max(64)).max(20).default([]),
  defaultPackages: z.array(templateDefaultPackageSchema).max(20).default([]),
});
export type TemplateSettingsJson = z.infer<typeof templateSettingsJson>;

/** Answers are primitives or arrays of primitives — never nested objects. */
export const answersSchema = z.record(
  z.string().max(64),
  z.union([z.string().max(20_000), z.number(), z.boolean(), z.array(z.string().max(2000)).max(200), z.null()]),
);

export function usedVariables(content: string): string[] {
  const found = new Set<string>();
  const matcher = /\{\{\s*([a-z][a-z0-9_]*)\s*\}\}/g;
  let match = matcher.exec(content);
  while (match) {
    found.add(match[1]);
    match = matcher.exec(content);
  }
  return [...found];
}

export function blockVariables(block: TemplateBlock): string[] {
  return usedVariables([block.content, ...block.items].join(' '));
}
