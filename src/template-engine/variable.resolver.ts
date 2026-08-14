import { Injectable } from '@nestjs/common';

import { DomainException } from 'src/common/errors/domain.exception';
import { ErrorCodes } from 'src/common/errors/error-codes';
import { ConditionEvaluator } from './condition.evaluator';
import { FormulaEngine } from './formula.engine';
import { formatMinor } from './money';
import { ValidationIssue } from './template-schema.validator';
import {
  FieldSchemaJson,
  NUMERIC_FIELD_TYPES,
  OPTION_FIELD_TYPES,
  TemplateField,
} from './template.contract';

export type AnswerValue = string | number | boolean | string[] | null;
export type Answers = Record<string, AnswerValue>;

export interface ResolveOptions {
  currency: string;
  locale: string;
  /** Values the engine always supplies: customer_name, grand_total, … */
  reserved: Record<string, string | number>;
}

export interface ResolvedVariables {
  /** Display strings for {{token}} substitution. */
  text: Record<string, string>;
  /** Numeric view of the same data, for formulas and pricing. */
  numeric: Record<string, number>;
  /** Which questions were visible given the answers — hidden ones are not required. */
  visibleFieldKeys: string[];
}

@Injectable()
export class VariableResolver {
  constructor(
    private readonly conditions: ConditionEvaluator,
    private readonly formulas: FormulaEngine,
  ) {}

  /**
   * Enforces the field schema against submitted answers.
   *
   * A required question that is conditionally hidden is *not* required — map.md
   * §22 calls for defined safe behaviour rather than an error when a branch of
   * the form was never shown.
   */
  validateAnswers(fields: FieldSchemaJson, answers: Answers): ValidationIssue[] {
    const issues: ValidationIssue[] = [];

    for (const field of fields.fields) {
      if (!this.conditions.evaluate(field.condition, answers)) continue;

      const raw = answers[field.key];
      const empty =
        raw === undefined ||
        raw === null ||
        raw === '' ||
        (Array.isArray(raw) && raw.length === 0);

      if (empty) {
        if (field.required) {
          issues.push({
            path: field.key,
            code: ErrorCodes.FIELD_REQUIRED,
            message: `"${field.label}" is required.`,
          });
        }
        continue;
      }

      const typeIssue = this.checkType(field, raw);
      if (typeIssue) issues.push(typeIssue);
    }

    return issues;
  }

  assertAnswersValid(fields: FieldSchemaJson, answers: Answers): void {
    const issues = this.validateAnswers(fields, answers);
    if (issues.length) {
      throw DomainException.invalid(
        ErrorCodes.FIELD_REQUIRED,
        'Some answers are missing or invalid.',
        issues,
      );
    }
  }

  /**
   * Builds the substitution scope: answers, then formulas (in dependency order),
   * then reserved values, which win so a template cannot shadow `grand_total`.
   */
  resolve(fields: FieldSchemaJson, answers: Answers, options: ResolveOptions): ResolvedVariables {
    const numeric = this.formulas.resolve(fields.formulas, answers);
    const text: Record<string, string> = {};

    for (const field of fields.fields) {
      const raw = answers[field.key] ?? (field.defaultValue || null);
      text[field.key] = this.display(field, raw, options);
    }

    for (const formula of fields.formulas) {
      const value = numeric[formula.key];
      text[formula.key] =
        value === undefined ? '' : this.formatNumber(value, options.currency, options.locale);
    }

    for (const [key, value] of Object.entries(options.reserved)) {
      text[key] = String(value);
      if (typeof value === 'number') numeric[key] = value;
    }

    const visibleFieldKeys = fields.fields
      .filter((field) => this.conditions.evaluate(field.condition, answers))
      .map((field) => field.key);

    return { text, numeric, visibleFieldKeys };
  }

  /** Replaces every {{token}}; unknown tokens collapse to "" rather than printing braces. */
  interpolate(content: string, scope: Record<string, string>): string {
    return content.replace(/\{\{\s*([a-z][a-z0-9_]*)\s*\}\}/g, (_match, key: string) => scope[key] ?? '');
  }

  private display(field: TemplateField, raw: AnswerValue, options: ResolveOptions): string {
    if (raw === null || raw === undefined) return '';
    if (Array.isArray(raw)) return raw.join(', ');
    if (typeof raw === 'boolean') return raw ? 'Yes' : 'No';

    if (field.type === 'CURRENCY') {
      const value = Number(raw);
      return Number.isFinite(value)
        ? formatMinor(Math.round(value * 100), options.currency, options.locale)
        : String(raw);
    }
    if (field.type === 'PERCENTAGE') {
      const value = Number(raw);
      return Number.isFinite(value) ? `${value}%` : String(raw);
    }
    return String(raw);
  }

  private formatNumber(value: number, currency: string, locale: string): string {
    // Whole-number results read as counts (nights, guests); fractions read as money.
    return Number.isInteger(value)
      ? new Intl.NumberFormat(locale).format(value)
      : formatMinor(Math.round(value * 100), currency, locale);
  }

  private checkType(field: TemplateField, raw: AnswerValue): ValidationIssue | null {
    const invalid = (message: string): ValidationIssue => ({
      path: field.key,
      code: ErrorCodes.FIELD_TYPE_INVALID,
      message,
    });

    if (NUMERIC_FIELD_TYPES.includes(field.type)) {
      const value = typeof raw === 'number' ? raw : Number(raw);
      if (!Number.isFinite(value)) return invalid(`"${field.label}" must be a number.`);
      if (field.type === 'PERCENTAGE' && (value < 0 || value > 100)) {
        return invalid(`"${field.label}" must be between 0 and 100.`);
      }
      return null;
    }

    if (field.type === 'BOOLEAN' && typeof raw !== 'boolean') {
      return invalid(`"${field.label}" must be true or false.`);
    }

    if (field.type === 'DATE' || field.type === 'DATETIME') {
      const parsed = new Date(String(raw));
      if (Number.isNaN(parsed.getTime())) return invalid(`"${field.label}" must be a valid date.`);
      return null;
    }

    if (field.type === 'EMAIL' && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(raw))) {
      return invalid(`"${field.label}" must be a valid email address.`);
    }

    if (field.type === 'URL' && !/^https?:\/\/\S+$/i.test(String(raw))) {
      return invalid(`"${field.label}" must be a valid URL.`);
    }

    if (OPTION_FIELD_TYPES.includes(field.type) && field.options.length) {
      // PACKAGE_SELECT / BLOCK_SELECT hold ids resolved elsewhere, so only the
      // plain choice types are checked against their option list.
      if (field.type === 'SELECT' && !field.options.includes(String(raw))) {
        return invalid(`"${raw}" is not one of the options for "${field.label}".`);
      }
      if (field.type === 'MULTI_SELECT') {
        const values = Array.isArray(raw) ? raw : [String(raw)];
        const stray = values.filter((value) => !field.options.includes(value));
        if (stray.length) {
          return invalid(`"${stray.join(', ')}" is not an option for "${field.label}".`);
        }
      }
    }

    return null;
  }
}
