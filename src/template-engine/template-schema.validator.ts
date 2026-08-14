import { Injectable } from '@nestjs/common';
import { ZodError, ZodTypeAny } from 'zod';

import { DomainException } from 'src/common/errors/domain.exception';
import { ErrorCode, ErrorCodes } from 'src/common/errors/error-codes';
import { FormulaEngine } from './formula.engine';
import { hasDocumentBody } from './document-body';
import { isBoundFieldBlockType } from './template-block.registry';
import {
  DocumentSchemaJson,
  FieldSchemaJson,
  OPTION_FIELD_TYPES,
  StyleSchemaJson,
  TemplateLinesJson,
  TemplateSettingsJson,
  blockVariables,
  documentSchemaJson,
  fieldSchemaJson,
  styleSchemaJson,
  templateLinesJson,
  templateSettingsJson,
} from './template.contract';

export interface ValidationIssue {
  path: string;
  code: ErrorCode;
  message: string;
}

export interface ValidationReport {
  valid: boolean;
  errors: ValidationIssue[];
  /** Non-blocking: a template can publish with warnings (map.md §62). */
  warnings: ValidationIssue[];
}

/**
 * Structural (zod) validation plus the cross-reference rules that zod cannot
 * express: unique keys, formulas that reference real fields, no cycles, blocks
 * that only use variables that exist.
 *
 * map.md §86 requires publish to fail on a formula referencing a deleted field
 * and on a circular formula — both are errors here, not warnings.
 */
@Injectable()
export class TemplateSchemaValidator {
  constructor(private readonly formulas: FormulaEngine) {}

  parseDocumentSchema(input: unknown): DocumentSchemaJson {
    const parsed = this.parse(
      documentSchemaJson,
      normaliseLegacyDocumentSchema(input),
      ErrorCodes.TEMPLATE_SCHEMA_INVALID,
      'document schema',
    );
    return {
      ...parsed,
      blocks: this.orderBlocksBySections(parsed),
    };
  }

  parseFieldSchema(input: unknown): FieldSchemaJson {
    return this.parse(fieldSchemaJson, input, ErrorCodes.FIELD_SCHEMA_INVALID, 'field schema');
  }

  parseTemplateLines(input: unknown): TemplateLinesJson {
    return this.parse(templateLinesJson, input, ErrorCodes.TEMPLATE_SCHEMA_INVALID, 'template lines');
  }

  parseStyleSchema(input: unknown): StyleSchemaJson {
    return this.parse(styleSchemaJson, input, ErrorCodes.TEMPLATE_SCHEMA_INVALID, 'style schema');
  }

  parseSettings(input: unknown): TemplateSettingsJson {
    return this.parse(templateSettingsJson, input, ErrorCodes.TEMPLATE_SCHEMA_INVALID, 'template settings');
  }

  /** Full report used by POST /templates/:id/validate and enforced on publish. */
  validate(
    schema: DocumentSchemaJson,
    fields: FieldSchemaJson,
    documentHtml?: unknown,
  ): ValidationReport {
    const errors: ValidationIssue[] = [];
    const warnings: ValidationIssue[] = [];
    const blockIds = new Set<string>();

    const fieldKeys = new Set<string>();
    fields.fields.forEach((field, index) => {
      if (fieldKeys.has(field.key)) {
        errors.push({
          path: `fields[${index}].key`,
          code: ErrorCodes.FIELD_SCHEMA_INVALID,
          message: `Duplicate question key "${field.key}".`,
        });
      }
      fieldKeys.add(field.key);

      if (OPTION_FIELD_TYPES.includes(field.type) && field.options.length === 0) {
        errors.push({
          path: `fields[${index}].options`,
          code: ErrorCodes.FIELD_SCHEMA_INVALID,
          message: `"${field.label}" is a choice question but has no options.`,
        });
      }

      /*
       * A question that asks for a price duplicates the pricing table, which
       * already handles quantity, rate, tax, discounts and totals — and does the
       * arithmetic. Templates that ask for "Base Price" or "Discount" as text put
       * the operator in front of two pricing systems, one of which does not add up.
       */
      if (PRICING_QUESTION_KEYS.has(field.key)) {
        warnings.push({
          path: `fields[${index}].key`,
          code: ErrorCodes.FIELD_SCHEMA_INVALID,
          message: `"${field.label}" asks for pricing the item table already handles. Consider removing it and adding a Pricing Table block instead.`,
        });
      }

      if (field.required && field.condition && field.condition.rules.length > 0) {
        warnings.push({
          path: `fields[${index}]`,
          code: ErrorCodes.FIELD_SCHEMA_INVALID,
          message: `"${field.label}" is required but conditionally hidden; it is only enforced when visible.`,
        });
      }
    });

    const formulaKeys = new Set<string>();
    fields.formulas.forEach((formula, index) => {
      if (fieldKeys.has(formula.key) || formulaKeys.has(formula.key)) {
        errors.push({
          path: `formulas[${index}].key`,
          code: ErrorCodes.FORMULA_INVALID,
          message: `"${formula.key}" is already used by another question or calculation.`,
        });
      }
      formulaKeys.add(formula.key);

      const analysis = this.formulas.analyze(formula.expression);
      if (analysis.error) {
        errors.push({
          path: `formulas[${index}].expression`,
          code: ErrorCodes.FORMULA_INVALID,
          message: `${formula.key}: ${analysis.error}`,
        });
        return;
      }

      // A formula pointing at a field that was later deleted must block publish.
      const unknown = analysis.refs.filter((ref) => !fieldKeys.has(ref) && !this.isFormulaKey(ref, fields));
      if (unknown.length) {
        errors.push({
          path: `formulas[${index}].expression`,
          code: ErrorCodes.UNKNOWN_VARIABLE_REFERENCE,
          message: `${formula.key} references unknown ${unknown.length > 1 ? 'fields' : 'field'}: ${unknown.join(', ')}.`,
        });
      }
    });

    const cycles = this.formulas.findCycles(fields.formulas);
    if (cycles.length) {
      errors.push({
        path: 'formulas',
        code: ErrorCodes.FORMULA_CIRCULAR_REFERENCE,
        message: `Calculations reference each other in a loop: ${cycles.join(', ')}.`,
      });
    }

    const known = new Set([...fieldKeys, ...formulaKeys, ...RESERVED_VARIABLES]);
    schema.blocks.forEach((block, index) => {
      if (blockIds.has(block.id)) {
        errors.push({
          path: `blocks[${index}].id`,
          code: ErrorCodes.TEMPLATE_SCHEMA_INVALID,
          message: `Duplicate block id "${block.id}".`,
        });
      }
      blockIds.add(block.id);

      blockVariables(block)
        .filter((variable) => !known.has(variable))
        .forEach((variable) => {
          warnings.push({
            path: `blocks[${index}].content`,
            code: ErrorCodes.UNKNOWN_VARIABLE_REFERENCE,
            message: `Block "${block.label || block.type}" uses {{${variable}}}, which no question defines.`,
          });
        });

      if (isBoundFieldBlockType(block.type)) {
        if (!block.fieldKey) {
          errors.push({
            path: `blocks[${index}].fieldKey`,
            code: ErrorCodes.UNKNOWN_VARIABLE_REFERENCE,
            message: `Block "${block.label || block.type}" is missing its bound question.`,
          });
        } else if (!fieldKeys.has(block.fieldKey)) {
          errors.push({
            path: `blocks[${index}].fieldKey`,
            code: ErrorCodes.UNKNOWN_VARIABLE_REFERENCE,
            message: `Block "${block.label || block.type}" references unknown field "${block.fieldKey}".`,
          });
        }
      }

      (block.condition?.rules ?? []).forEach((rule) => {
        if (rule.field && !known.has(rule.field)) {
          errors.push({
            path: `blocks[${index}].condition`,
            code: ErrorCodes.UNKNOWN_VARIABLE_REFERENCE,
            message: `Visibility rule on "${block.label || block.type}" references unknown field "${rule.field}".`,
          });
        }
      });
    });

    const assignedToSection = new Set<string>();
    schema.sections.forEach((section, sectionIndex) => {
      section.blockIds.forEach((blockId, blockIndex) => {
        if (!blockIds.has(blockId)) {
          errors.push({
            path: `sections[${sectionIndex}].blockIds[${blockIndex}]`,
            code: ErrorCodes.TEMPLATE_SCHEMA_INVALID,
            message: `Section "${section.title}" references unknown block "${blockId}".`,
          });
          return;
        }

        if (assignedToSection.has(blockId)) {
          errors.push({
            path: `sections[${sectionIndex}].blockIds[${blockIndex}]`,
            code: ErrorCodes.TEMPLATE_SCHEMA_INVALID,
            message: `Block "${blockId}" appears in more than one section.`,
          });
          return;
        }

        assignedToSection.add(blockId);
      });
    });

    if (schema.blocks.length === 0 && !hasDocumentBody(documentHtml)) {
      errors.push({
        path: 'blocks',
        code: ErrorCodes.TEMPLATE_SCHEMA_INVALID,
        message: 'A template needs at least one block before it can be published.',
      });
    }

    return { valid: errors.length === 0, errors, warnings };
  }

  /** Throws if the template cannot be published — map.md §62. */
  assertPublishable(
    schema: DocumentSchemaJson,
    fields: FieldSchemaJson,
    documentHtml?: unknown,
  ): ValidationReport {
    const report = this.validate(schema, fields, documentHtml);
    if (!report.valid) {
      throw DomainException.invalid(
        ErrorCodes.TEMPLATE_SCHEMA_INVALID,
        'This template cannot be published yet.',
        report.errors,
      );
    }
    return report;
  }

  private isFormulaKey(ref: string, fields: FieldSchemaJson): boolean {
    return fields.formulas.some((formula) => formula.key === ref);
  }

  private orderBlocksBySections(schema: DocumentSchemaJson): DocumentSchemaJson['blocks'] {
    if (schema.sections.length === 0) return schema.blocks;

    const byId = new Map(schema.blocks.map((block) => [block.id, block]));
    const ordered: DocumentSchemaJson['blocks'] = [];
    const pushed = new Set<string>();

    schema.sections.forEach((section) => {
      section.blockIds.forEach((blockId) => {
        const block = byId.get(blockId);
        if (!block || pushed.has(blockId)) return;
        ordered.push(block);
        pushed.add(blockId);
      });
    });

    schema.blocks.forEach((block) => {
      if (pushed.has(block.id)) return;
      ordered.push(block);
    });

    return ordered;
  }

  private parse<T extends ZodTypeAny>(
    schema: T,
    input: unknown,
    code: ErrorCode,
    label: string,
  ): T['_output'] {
    const result = schema.safeParse(input ?? {});
    if (result.success) return result.data;
    throw DomainException.invalid(code, `Invalid ${label}.`, formatZodError(result.error));
  }
}

/**
 * Question keys that mean the template is re-implementing the pricing table.
 * Warned about on validate, never blocked — an existing template must keep working.
 */
const PRICING_QUESTION_KEYS = new Set([
  'base_price',
  'price',
  'rate',
  'amount',
  'total',
  'grand_total',
  'subtotal',
  'discount',
  'discount_amount',
  'discount_percent',
  'tax',
  'tax_amount',
]);

/** Variables the engine always provides, regardless of the question set. */
export const RESERVED_VARIABLES = [
  'customer_name',
  'customer_company',
  'customer_email',
  'customer_phone',
  'customer_address',
  // Legacy alias kept so older templates that used {{phone}} still validate and render.
  'phone',
  'company_name',
  'document_number',
  'document_date',
  'valid_until',
  'subtotal',
  'discount_total',
  'tax_total',
  'grand_total',
];

export function formatZodError(error: ZodError): ValidationIssue[] {
  return error.issues.map((issue) => ({
    path: issue.path.join('.') || '(root)',
    code: ErrorCodes.VALIDATION_FAILED,
    message: issue.message,
  }));
}

const LEGACY_BLOCK_TYPE_MAP = {
  itinerary: 'repeatingList',
  detailedItinerary: 'repeatingList',
  inclusion: 'repeatingList',
  exclusion: 'repeatingList',
} as const;

function normaliseLegacyDocumentSchema(input: unknown): unknown {
  if (!input || typeof input !== 'object') return input;

  const schema = input as Record<string, unknown>;
  if (!Array.isArray(schema.blocks)) return input;

  return {
    ...schema,
    blocks: schema.blocks.map((entry) => {
      if (!entry || typeof entry !== 'object') return entry;

      const block = entry as Record<string, unknown>;
      const type = typeof block.type === 'string' ? block.type : '';
      const mappedType =
        LEGACY_BLOCK_TYPE_MAP[type as keyof typeof LEGACY_BLOCK_TYPE_MAP];

      return mappedType ? { ...block, type: mappedType } : block;
    }),
  };
}
