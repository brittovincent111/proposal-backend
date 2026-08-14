import { Injectable } from '@nestjs/common';

/** map.md §22 — conditional visibility for fields and blocks. */
export const ConditionOperators = [
  'EQ',
  'NEQ',
  'GT',
  'GTE',
  'LT',
  'LTE',
  'IN',
  'NOT_IN',
  'CONTAINS',
  'NOT_CONTAINS',
  'IS_EMPTY',
  'IS_NOT_EMPTY',
] as const;
export type ConditionOperator = (typeof ConditionOperators)[number];

export interface ConditionRule {
  id: string;
  field: string;
  operator: ConditionOperator;
  value: string;
}

export interface ConditionGroup {
  mode: 'all' | 'any';
  rules: ConditionRule[];
}

const VALUELESS: ConditionOperator[] = ['IS_EMPTY', 'IS_NOT_EMPTY'];

export function operatorNeedsValue(operator: ConditionOperator): boolean {
  return !VALUELESS.includes(operator);
}

function asNumber(raw: unknown): number | null {
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
  if (typeof raw === 'string' && raw.trim() !== '') {
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function asList(raw: string): string[] {
  return raw
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
}

@Injectable()
export class ConditionEvaluator {
  /**
   * An empty or field-less group means "always visible". A rule pointing at a
   * missing answer is evaluated against the empty string rather than throwing —
   * map.md §22 requires defined safe behaviour, not an error, when a conditional
   * field was never answered.
   */
  evaluate(group: ConditionGroup | null | undefined, answers: Record<string, unknown>): boolean {
    if (!group || group.rules.length === 0) return true;
    const usable = group.rules.filter((rule) => rule.field);
    if (usable.length === 0) return true;
    return group.mode === 'all'
      ? usable.every((rule) => this.evaluateRule(rule, answers))
      : usable.some((rule) => this.evaluateRule(rule, answers));
  }

  private evaluateRule(rule: ConditionRule, answers: Record<string, unknown>): boolean {
    const answer = answers[rule.field];
    const text = answer === undefined || answer === null ? '' : String(answer);

    switch (rule.operator) {
      case 'IS_EMPTY':
        return text.trim() === '' || text === 'false';
      case 'IS_NOT_EMPTY':
        return text.trim() !== '' && text !== 'false';
      case 'EQ':
        return text.toLowerCase() === rule.value.trim().toLowerCase();
      case 'NEQ':
        return text.toLowerCase() !== rule.value.trim().toLowerCase();
      case 'GT':
      case 'GTE':
      case 'LT':
      case 'LTE': {
        const left = asNumber(answer);
        const right = asNumber(rule.value);
        if (left === null || right === null) return false;
        if (rule.operator === 'GT') return left > right;
        if (rule.operator === 'GTE') return left >= right;
        if (rule.operator === 'LT') return left < right;
        return left <= right;
      }
      case 'IN':
        return asList(rule.value).includes(text.toLowerCase());
      case 'NOT_IN':
        return !asList(rule.value).includes(text.toLowerCase());
      case 'CONTAINS':
        return text.toLowerCase().includes(rule.value.trim().toLowerCase());
      case 'NOT_CONTAINS':
        return !text.toLowerCase().includes(rule.value.trim().toLowerCase());
      default:
        return true;
    }
  }
}
