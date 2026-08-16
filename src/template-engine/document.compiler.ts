import { Injectable } from '@nestjs/common';

import { ConditionEvaluator } from './condition.evaluator';
import {
  documentBodyFieldKeys,
  fillDocumentFields,
  hasDocumentBody,
  sanitiseDocumentBody,
} from './document-body';
import { PricingCalculator } from './pricing.calculator';
import {
  DocumentSection,
  DocumentTotals,
  Discount,
  ExtraCharge,
  TaxRateSnapshot,
} from './pricing.types';
import {
  DocumentSchemaJson,
  FieldSchemaJson,
  StyleSchemaJson,
  TemplateBlock,
} from './template.contract';
import {
  blocksConsumeClosingSections,
  isBoundFieldBlockType,
  resolvedBlockCarriesContent,
  templateBlockDefinition,
} from './template-block.registry';
import { Answers, VariableResolver } from './variable.resolver';

export interface CompileMeta {
  documentNumber: string;
  documentDate: Date;
  validUntil: Date;
  currency: string;
  locale: string;
  /** Optional so revisions compiled before these were captured still render. */
  title?: string;
  reference?: string;
  customer: {
    name: string;
    companyName: string;
    email: string;
    phone: string;
    billingAddress: string;
  };
  company: {
    name: string;
    address: string;
    phone: string;
    email: string;
    website?: string;
    taxNumber?: string;
    logoUrl?: string | null;
    accentColor?: string;
  };
  terms: string;
  paymentTerms: string;
  customerNotes: string;
}

/**
 * A proposal: a template, its answers, and nothing that costs money.
 *
 * There is no `sections` member, so the proposal branch of the compiler has
 * nothing to price even if someone tried. That is the hard wall, expressed as a
 * type rather than as a rule someone has to remember.
 */
export interface ProposalCompileInput {
  kind: 'PROPOSAL';
  schema: DocumentSchemaJson;
  fields: FieldSchemaJson;
  style: StyleSchemaJson;
  answers: Answers;
  /**
   * A template authored as a free-form document rather than as blocks.
   *
   * When present it replaces the block body entirely. Optional so every template
   * authored before the document editor existed keeps compiling unchanged.
   */
  documentHtml?: string;
  meta: CompileMeta;
}

/** A quotation: priced lines and a fixed layout. No template, so no `schema`. */
export interface QuotationCompileInput {
  kind: 'QUOTATION';
  style: StyleSchemaJson;
  sections: DocumentSection[];
  taxRates: TaxRateSnapshot[];
  overallDiscount: Discount;
  charges: ExtraCharge[];
  taxInclusive: boolean;
  roundOff: boolean;
  meta: CompileMeta;
}

export type CompileInput = ProposalCompileInput | QuotationCompileInput;

export interface ResolvedBlock {
  id: string;
  type: TemplateBlock['type'];
  label: string;
  content: string;
  items: string[];
  /** Optional so revisions compiled before widths existed still render. */
  width?: 'full' | 'half' | 'third';
  align: string;
  spacing: string;
  emphasis: string;
  /** Optional so revisions compiled before this existed still render. */
  newPage?: boolean;
}

interface CompiledCommon {
  schemaVersion: number;
  meta: CompileMeta & { visibleFieldKeys: string[] };
  style: StyleSchemaJson;
}

/**
 * Deliberately has no `pricing` member — not even an optional one.
 *
 * An optional field would let `compiled.pricing?.totals` slide through every
 * reader untouched, and the wall would survive only as a convention. Because the
 * member is absent from the type, `compiled.pricing` is a compile error until the
 * caller narrows on `kind`, which is what makes the compiler enumerate the
 * readers instead of a person having to.
 */
export interface CompiledProposal extends CompiledCommon {
  kind: 'PROPOSAL';
  blocks: ResolvedBlock[];
  /**
   * The document-authored body, sanitised with its field values already filled
   * in. Present only for document-authored templates; when it is, the renderer
   * prints it instead of `blocks`. Baked into the revision like everything else
   * here, so what the customer received stays reproducible.
   */
  body?: string;
  /**
   * Document fields the template body already printed, so the renderer's closing
   * section does not print them a second time. Optional: revisions compiled
   * before this existed simply fall back to the old behaviour.
   */
  consumed?: { terms?: boolean; paymentTerms?: boolean };
}

export interface CompiledQuotation extends CompiledCommon {
  kind: 'QUOTATION';
  pricing: {
    sections: DocumentSection[];
    totals: DocumentTotals;
    currency: string;
    locale: string;
    taxInclusive: boolean;
  };
}

export type CompiledDocument = CompiledProposal | CompiledQuotation;

/**
 * What a proposal prints when its every authored block was conditionally hidden.
 *
 * The quotation half of this constant is gone: a quotation has no block list to
 * fall back into, because its layout is fixed and lives in the renderer. What
 * remains is a courtesy rather than the money-safety guarantee it used to be —
 * an empty proposal is an authoring mistake, but a customer opening a literally
 * blank PDF is still the worst outcome available, and this is four lines.
 */
const PROPOSAL_FALLBACK_BLOCKS: TemplateBlock[] = [
  {
    id: 'fallback-intro',
    type: 'text',
    label: '',
    refId: '',
    fieldKey: '',
    content: 'Dear {{customer_name}}, thank you for the opportunity.',
    items: [],
    width: 'full',
    align: 'left',
    spacing: 'normal',
    emphasis: 'normal',
    newPage: false,
    condition: null,
  },
];

/**
 * Orchestrates generation — the twelve steps of map.md §29, in order.
 *
 * The output is entirely self-contained: rendering it later must not require
 * reading the template, the packages, the item master or the customer record.
 */
@Injectable()
export class DocumentCompiler {
  constructor(
    private readonly variables: VariableResolver,
    private readonly conditions: ConditionEvaluator,
    private readonly pricing: PricingCalculator,
  ) {}

  compile(input: CompileInput): CompiledDocument {
    return input.kind === 'QUOTATION'
      ? this.compileQuotation(input)
      : this.compileProposal(input);
  }

  /**
   * A proposal: variables in, words out. The pricing calculator is never called.
   *
   * `reserved` carries no money keys, so a template that still says
   * `{{grand_total}}` prints nothing rather than a number — `interpolate` and
   * `fillDocumentFields` both resolve an unknown key to ''. The template
   * validator rejects those four names at publish, so this is the second line of
   * defence rather than the first.
   */
  private compileProposal(input: ProposalCompileInput): CompiledProposal {
    const reserved: Record<string, string | number> = {
      customer_name: input.meta.customer.name,
      customer_company: input.meta.customer.companyName,
      customer_email: input.meta.customer.email,
      customer_phone: input.meta.customer.phone,
      phone: input.meta.customer.phone,
      customer_address: input.meta.customer.billingAddress,
      company_name: input.meta.company.name,
      document_number: input.meta.documentNumber,
      document_date: input.meta.documentDate.toISOString().slice(0, 10),
      valid_until: input.meta.validUntil.toISOString().slice(0, 10),
    };

    const resolved = this.variables.resolve(input.fields, input.answers, {
      currency: input.meta.currency,
      locale: input.meta.locale,
      reserved,
    });

    // A document-authored template carries its whole body as HTML. Field values
    // are substituted here so the revision is self-contained.
    const authoredBody = hasDocumentBody(input.documentHtml)
      ? sanitiseDocumentBody(input.documentHtml as string)
      : '';
    const body = authoredBody
      ? fillDocumentFields(authoredBody, {
          ...resolved.text,
          ...this.documentFieldValues(input.meta),
        })
      : undefined;

    const authored = input.schema.blocks
      .filter((block) => this.conditions.evaluate(block.condition, input.answers))
      .map((block) => this.resolveBlock(block, resolved.text, input));

    const blocks =
      body || authored.some(resolvedBlockCarriesContent)
        ? authored
        : PROPOSAL_FALLBACK_BLOCKS.map((block) => this.resolveBlock(block, resolved.text, input));

    return {
      kind: 'PROPOSAL',
      schemaVersion: input.schema.schemaVersion,
      blocks,
      body,
      meta: { ...input.meta, visibleFieldKeys: resolved.visibleFieldKeys },
      style: input.style,
      // Read from the body before substitution: filling replaces the very
      // markers this inspects.
      consumed: authoredBody
        ? this.bodyConsumesClosingSections(authoredBody)
        : blocksConsumeClosingSections(blocks),
    };
  }

  /**
   * A quotation: one pricing pass, and no blocks at all.
   *
   * The old two-pass structure existed because formula-priced lines could
   * reference template answers, so pricing had to run once to seed the reserved
   * totals and again with the resolved scope. A quotation has no template and
   * therefore no answers, so a single pass reaches the same fixed point.
   */
  private compileQuotation(input: QuotationCompileInput): CompiledQuotation {
    const totals = this.pricing.calculate({
      sections: input.sections,
      taxRates: input.taxRates,
      overallDiscount: input.overallDiscount,
      charges: input.charges,
      taxInclusive: input.taxInclusive,
      roundOff: input.roundOff,
    });

    return {
      kind: 'QUOTATION',
      schemaVersion: 1,
      pricing: {
        sections: input.sections,
        totals,
        currency: input.meta.currency,
        locale: input.meta.locale,
        taxInclusive: input.taxInclusive,
      },
      meta: { ...input.meta, visibleFieldKeys: [] },
      style: input.style,
    };
  }

  /**
   * Values a document body can print, keyed exactly as the editor's field picker.
   *
   * Wider than the `{{token}}` scope blocks use: a body prints dates the way the
   * letterhead does rather than as ISO strings, and can reach company contact
   * details that no block type ever needed. Anything absent resolves to '' and
   * prints nothing.
   */
  private documentFieldValues(meta: CompileMeta): Record<string, string> {
    const { customer, company } = meta;
    return {
      customer_name: customer.name,
      customer_company: customer.companyName,
      customer_address: customer.billingAddress,
      customer_phone: customer.phone,
      customer_email: customer.email,

      document_number: meta.documentNumber,
      document_date: formatDate(meta.documentDate, meta.locale),
      valid_until: formatDate(meta.validUntil, meta.locale),
      reference: meta.reference ?? '',

      company_name: company.name,
      company_address: company.address,
      company_phone: company.phone,
      company_email: company.email,
      company_tax_number: company.taxNumber ?? '',

      terms: meta.terms,
      payment_terms: meta.paymentTerms,
      customer_notes: meta.customerNotes,
    };
  }

  /**
   * A body that prints the terms itself stops the renderer printing them again.
   *
   * Same rule the block path follows, decided from which fields the body uses.
   */
  private bodyConsumesClosingSections(body: string): { terms: boolean; paymentTerms: boolean } {
    const keys = new Set(documentBodyFieldKeys(body));
    return { terms: keys.has('terms'), paymentTerms: keys.has('payment_terms') };
  }

  private resolveBlock(
    block: TemplateBlock,
    scope: Record<string, string>,
    input: ProposalCompileInput,
  ): ResolvedBlock {
    const definition = templateBlockDefinition(block.type);
    const boundField = block.fieldKey
      ? input.fields.fields.find((field) => field.key === block.fieldKey) ?? null
      : null;
    const dynamicItems = definition.dynamicItems?.(input) ?? [];
    const preferredContent = definition.dynamicContent?.(input) ?? '';

    // Author's rows first, then what the package and the quotation contribute.
    // Deduplicated, so a template that repeats a package's wording prints once.
    // For terms and payment the quotation is authoritative: whatever the template
    // author typed is boilerplate, and printing both would repeat the section.
    const merged = definition.dynamicItemsMode === 'replaceWhenPresent' && dynamicItems.length
      ? dynamicItems
      : [...block.items, ...dynamicItems];

    return {
      id: block.id,
      type: block.type,
      label: isBoundFieldBlockType(block.type)
        ? boundField?.label?.trim() || block.label
        : block.label,
      content:
        preferredContent.trim() !== ''
          ? preferredContent
          : isBoundFieldBlockType(block.type)
            ? this.resolveFieldValue(block, scope)
            : this.variables.interpolate(block.content, scope),
      items: uniqueStrings(
        merged
          .map((item) => this.variables.interpolate(item, scope))
          // A list row that resolved to nothing is dropped rather than printed blank.
          .filter((item) => item.trim() !== ''),
      ),
      width: block.width,
      align: block.align,
      spacing: block.spacing,
      emphasis: block.emphasis,
      newPage: block.newPage,
    };
  }

  private resolveFieldValue(
    block: TemplateBlock,
    scope: Record<string, string>,
  ): string {
    if (!block.fieldKey) return this.variables.interpolate(block.content, scope);
    return scope[block.fieldKey] ?? '';
  }

}

function uniqueStrings(values: string[]) {
  return [...new Set(values.filter((value) => value.trim() !== ''))];
}

/**
 * Dates in a document body read as a person would write them.
 *
 * Blocks print the ISO form through `{{document_date}}`; changing that would
 * alter existing templates, so the friendlier form is confined to bodies.
 */
function formatDate(value: Date | string | null | undefined, locale: string): string {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  try {
    return new Intl.DateTimeFormat(locale || 'en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    }).format(date);
  } catch {
    return date.toISOString().slice(0, 10);
  }
}
