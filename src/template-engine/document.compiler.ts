import { Injectable } from '@nestjs/common';

import { ConditionEvaluator } from './condition.evaluator';
import {
  documentBodyFieldKeys,
  fillDocumentFields,
  hasDocumentBody,
  sanitiseDocumentBody,
} from './document-body';
import { formatMinor } from './money';
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
  CompilePackageSnapshot,
  isBoundFieldBlockType,
  resolvedBlockCarriesContent,
  templateBlockDefinition,
} from './template-block.registry';
import { Answers, VariableResolver } from './variable.resolver';

export interface CompileInput {
  schema: DocumentSchemaJson;
  fields: FieldSchemaJson;
  style: StyleSchemaJson;
  answers: Answers;
  packages: CompilePackageSnapshot[];
  /**
   * A template authored as a free-form document rather than as blocks.
   *
   * When present it replaces the block body entirely. Optional so every template
   * authored before the document editor existed keeps compiling unchanged.
   */
  documentHtml?: string;

  sections: DocumentSection[];
  taxRates: TaxRateSnapshot[];
  overallDiscount: Discount;
  charges: ExtraCharge[];
  taxInclusive: boolean;
  roundOff: boolean;

  meta: {
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
  };
}

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

export interface CompiledDocument {
  schemaVersion: number;
  blocks: ResolvedBlock[];
  pricing: {
    sections: DocumentSection[];
    totals: DocumentTotals;
    currency: string;
    locale: string;
    taxInclusive: boolean;
  };
  meta: CompileInput['meta'] & { visibleFieldKeys: string[] };
  style: StyleSchemaJson;
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

/**
 * The body every quotation falls back to: an address line and the prices.
 *
 * Reached when a document has no template pinned, or when conditions hid every
 * authored block. Both cases used to produce a document with no line items,
 * which is the one output a quotation must never have.
 */
const FALLBACK_BLOCKS: TemplateBlock[] = [
  {
    id: 'fallback-intro',
    type: 'text',
    label: '',
    refId: '',
    fieldKey: '',
    content:
      'Dear {{customer_name}}, thank you for the opportunity. Our quotation is set out below.',
    items: [],
    width: 'full',
    align: 'left',
    spacing: 'normal',
    emphasis: 'normal',
    newPage: false,
    condition: null,
  },
  {
    id: 'fallback-pricing',
    type: 'pricingTable',
    label: '',
    refId: '',
    fieldKey: '',
    content: '',
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
    // Pricing runs first: totals are themselves variables the body can print.
    const preliminary = this.pricing.calculate({
      sections: input.sections,
      taxRates: input.taxRates,
      overallDiscount: input.overallDiscount,
      charges: input.charges,
      taxInclusive: input.taxInclusive,
      roundOff: input.roundOff,
    });

    const money = (amount: number) => formatMinor(amount, input.meta.currency, input.meta.locale);
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
      subtotal: money(preliminary.subtotal),
      discount_total: money(preliminary.discountTotal),
      tax_total: money(preliminary.taxTotal),
      grand_total: money(preliminary.grandTotal),
    };

    const resolved = this.variables.resolve(input.fields, input.answers, {
      currency: input.meta.currency,
      locale: input.meta.locale,
      reserved,
    });

    // Formula-priced lines can reference answers, so pricing is recomputed once
    // the scope exists. Reserved totals are strings and never feed back in, which
    // is what keeps this from needing a fixed point.
    const totals = this.pricing.calculate({
      sections: input.sections,
      taxRates: input.taxRates,
      overallDiscount: input.overallDiscount,
      charges: input.charges,
      taxInclusive: input.taxInclusive,
      roundOff: input.roundOff,
      scope: resolved.numeric,
    });

    // A document-authored template carries its whole body as HTML. Field values
    // are substituted here so the revision is self-contained; the item table is
    // left as a marker for the renderer, which owns pricing markup.
    const authoredBody = hasDocumentBody(input.documentHtml)
      ? sanitiseDocumentBody(input.documentHtml as string)
      : '';
    const body = authoredBody
      ? fillDocumentFields(authoredBody, {
          // Answers first: a reserved key always wins, so an invented field
          // named `grand_total` cannot overwrite the real total.
          ...resolved.text,
          ...this.documentFieldValues(input, totals, money),
        })
      : undefined;

    // A document with no template — or a template whose every block is
    // conditionally hidden — would otherwise compile to an empty body and be
    // sent to a customer with no prices in it. The fallback body is the minimum
    // a quotation must always contain, and it is baked into the revision so what
    // was sent stays reproducible. A document body is content in its own right,
    // so it is not replaced by the fallback.
    const authored = input.schema.blocks
      .filter((block) => this.conditions.evaluate(block.condition, input.answers))
      .map((block) => this.resolveBlock(block, resolved.text, input));

    const blocks =
      body || authored.some(resolvedBlockCarriesContent)
        ? authored
        : FALLBACK_BLOCKS.map((block) => this.resolveBlock(block, resolved.text, input));
    const pagedBlocks = this.promoteCommercialSections(blocks);

    return {
      schemaVersion: input.schema.schemaVersion,
      blocks: pagedBlocks,
      body,
      pricing: {
        sections: input.sections,
        totals,
        currency: input.meta.currency,
        locale: input.meta.locale,
        taxInclusive: input.taxInclusive,
      },
      meta: { ...input.meta, visibleFieldKeys: resolved.visibleFieldKeys },
      style: input.style,
      // Read from the body before substitution: filling replaces the very
      // markers this inspects.
      consumed: authoredBody
        ? this.bodyConsumesClosingSections(authoredBody)
        : blocksConsumeClosingSections(pagedBlocks),
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
  private documentFieldValues(
    input: CompileInput,
    totals: DocumentTotals,
    money: (amount: number) => string,
  ): Record<string, string> {
    const meta = input.meta;
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

      subtotal: money(totals.subtotal),
      discount_total: money(totals.discountTotal),
      tax_total: money(totals.taxTotal),
      grand_total: money(totals.grandTotal),

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
    input: CompileInput,
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

  /**
   * Narrative-heavy proposals read better when pricing starts its own page.
   *
   * The heuristic is intentionally conservative: at least two content blocks
   * must exist before pricing, otherwise the simple fallback body and short
   * one-section quotes would turn into unnecessary two-page documents.
   */
  private promoteCommercialSections(blocks: ResolvedBlock[]): ResolvedBlock[] {
    const pricingIndex = blocks.findIndex((block) => templateBlockDefinition(block.type).commercialAnchor);
    if (pricingIndex === -1) return blocks;
    if (blocks[pricingIndex].newPage) return blocks;

    const priorContentIndexes = blocks
      .slice(0, pricingIndex)
      .flatMap((block, index) => (resolvedBlockCarriesContent(block) ? [index] : []));
    if (priorContentIndexes.length < 2) return blocks;

    const lastNarrativeIndex = priorContentIndexes[priorContentIndexes.length - 1];
    const explicitBreak = blocks
      .slice(lastNarrativeIndex + 1, pricingIndex + 1)
      .some((block) => templateBlockDefinition(block.type).explicitPageBreak || block.newPage);
    if (explicitBreak) return blocks;

    return blocks.map((block, index) =>
      index === pricingIndex ? { ...block, newPage: true } : block,
    );
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
