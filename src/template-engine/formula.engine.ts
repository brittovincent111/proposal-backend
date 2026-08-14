import { Injectable } from '@nestjs/common';

/**
 * Safe arithmetic evaluator — map.md §21, §76.
 *
 * No eval(), no new Function(), no user-supplied code path of any kind: the
 * expression is tokenized, shunting-yarded into RPN, then walked. Whitelist
 * only: + - * / % parentheses, numbers and field references.
 */

type Token =
  | { kind: 'number'; value: number }
  | { kind: 'ref'; value: string }
  | { kind: 'op'; value: '+' | '-' | '*' | '/' | '%' | 'u-' }
  | { kind: 'paren'; value: '(' | ')' };

export interface FormulaAnalysis {
  refs: string[];
  error: string | null;
}

export interface FormulaDefinition {
  key: string;
  expression: string;
}

const PRECEDENCE: Record<string, number> = { '+': 1, '-': 1, '*': 2, '/': 2, '%': 2, 'u-': 3 };

/** Guards against a pathological expression consuming the request thread. */
const MAX_EXPRESSION_LENGTH = 2000;

function tokenize(expression: string): { tokens: Token[]; error: string | null } {
  const tokens: Token[] = [];
  let index = 0;

  if (expression.length > MAX_EXPRESSION_LENGTH) {
    return { tokens, error: `Expression exceeds ${MAX_EXPRESSION_LENGTH} characters.` };
  }

  while (index < expression.length) {
    const char = expression[index];

    if (/\s/.test(char)) {
      index += 1;
      continue;
    }

    if (/[0-9.]/.test(char)) {
      let raw = '';
      while (index < expression.length && /[0-9.]/.test(expression[index])) {
        raw += expression[index];
        index += 1;
      }
      const value = Number(raw);
      if (!Number.isFinite(value)) return { tokens, error: `"${raw}" is not a valid number.` };
      tokens.push({ kind: 'number', value });
      continue;
    }

    if (/[a-zA-Z_]/.test(char)) {
      let raw = '';
      while (index < expression.length && /[a-zA-Z0-9_]/.test(expression[index])) {
        raw += expression[index];
        index += 1;
      }
      tokens.push({ kind: 'ref', value: raw });
      continue;
    }

    if (char === '(' || char === ')') {
      tokens.push({ kind: 'paren', value: char });
      index += 1;
      continue;
    }

    if ('+-*/%'.includes(char)) {
      const previous = tokens[tokens.length - 1];
      const isUnary =
        char === '-' &&
        (!previous || previous.kind === 'op' || (previous.kind === 'paren' && previous.value === '('));
      tokens.push({ kind: 'op', value: isUnary ? 'u-' : (char as '+' | '-' | '*' | '/' | '%') });
      index += 1;
      continue;
    }

    return { tokens, error: `"${char}" is not allowed. Use + - * / % and parentheses only.` };
  }

  return { tokens, error: null };
}

function toRpn(tokens: Token[]): { output: Token[]; error: string | null } {
  const output: Token[] = [];
  const stack: Token[] = [];

  for (const token of tokens) {
    if (token.kind === 'number' || token.kind === 'ref') {
      output.push(token);
      continue;
    }
    if (token.kind === 'op') {
      while (stack.length) {
        const top = stack[stack.length - 1];
        if (top.kind !== 'op') break;
        if (PRECEDENCE[top.value] < PRECEDENCE[token.value]) break;
        if (token.value === 'u-' && PRECEDENCE[top.value] === PRECEDENCE[token.value]) break;
        output.push(stack.pop() as Token);
      }
      stack.push(token);
      continue;
    }
    if (token.value === '(') {
      stack.push(token);
      continue;
    }
    let matched = false;
    while (stack.length) {
      const top = stack.pop() as Token;
      if (top.kind === 'paren' && top.value === '(') {
        matched = true;
        break;
      }
      output.push(top);
    }
    if (!matched) return { output, error: 'Unbalanced parentheses.' };
  }

  while (stack.length) {
    const top = stack.pop() as Token;
    if (top.kind === 'paren') return { output, error: 'Unbalanced parentheses.' };
    output.push(top);
  }

  return { output, error: null };
}

@Injectable()
export class FormulaEngine {
  /** Parses without evaluating — used by template validation and dependency graphs. */
  analyze(expression: string): FormulaAnalysis {
    if (!expression.trim()) return { refs: [], error: 'Expression is empty.' };

    const { tokens, error: tokenError } = tokenize(expression);
    if (tokenError) return { refs: [], error: tokenError };

    const { output, error: rpnError } = toRpn(tokens);
    if (rpnError) return { refs: [], error: rpnError };

    const refs = [...new Set(tokens.filter((token) => token.kind === 'ref').map((token) => token.value))];

    // Dry-run the stack machine so malformed expressions are caught before publish.
    let depth = 0;
    for (const token of output) {
      if (token.kind === 'number' || token.kind === 'ref') {
        depth += 1;
      } else if (token.kind === 'op') {
        const needed = token.value === 'u-' ? 1 : 2;
        if (depth < needed) return { refs, error: 'Expression is incomplete.' };
        depth = depth - needed + 1;
      }
    }
    if (depth !== 1) return { refs, error: 'Expression is incomplete.' };

    return { refs, error: null };
  }

  evaluate(
    expression: string,
    scope: Record<string, number>,
  ): { value: number | null; error: string | null } {
    const analysis = this.analyze(expression);
    if (analysis.error) return { value: null, error: analysis.error };

    const missing = analysis.refs.filter((ref) => !(ref in scope));
    if (missing.length) return { value: null, error: `Unknown reference: ${missing.join(', ')}` };

    const { tokens } = tokenize(expression);
    const { output } = toRpn(tokens);
    const stack: number[] = [];

    for (const token of output) {
      if (token.kind === 'number') {
        stack.push(token.value);
        continue;
      }
      if (token.kind === 'ref') {
        stack.push(scope[token.value]);
        continue;
      }
      if (token.kind !== 'op') continue;

      if (token.value === 'u-') {
        stack.push(-(stack.pop() as number));
        continue;
      }
      const right = stack.pop() as number;
      const left = stack.pop() as number;
      if ((token.value === '/' || token.value === '%') && right === 0) {
        return { value: null, error: 'Division by zero.' };
      }
      if (token.value === '+') stack.push(left + right);
      if (token.value === '-') stack.push(left - right);
      if (token.value === '*') stack.push(left * right);
      if (token.value === '/') stack.push(left / right);
      if (token.value === '%') stack.push(left % right);
    }

    const value = stack.pop();
    if (value === undefined || !Number.isFinite(value)) {
      return { value: null, error: 'Expression is incomplete.' };
    }
    return { value, error: null };
  }

  /** Returns the keys involved in a cycle, e.g. A = B + 1 and B = A + 1 (map.md §21). */
  findCycles(formulas: FormulaDefinition[]): string[] {
    const graph = new Map<string, string[]>();
    formulas.forEach((formula) => {
      graph.set(formula.key, this.analyze(formula.expression).refs);
    });

    const cyclic = new Set<string>();
    const state = new Map<string, 'visiting' | 'done'>();

    const visit = (key: string, trail: string[]) => {
      const current = state.get(key);
      if (current === 'done') return;
      if (current === 'visiting') {
        const start = trail.indexOf(key);
        trail.slice(start === -1 ? 0 : start).forEach((entry) => cyclic.add(entry));
        return;
      }
      state.set(key, 'visiting');
      (graph.get(key) ?? []).forEach((ref) => {
        if (graph.has(ref)) visit(ref, [...trail, key]);
      });
      state.set(key, 'done');
    };

    formulas.forEach((formula) => visit(formula.key, []));
    return [...cyclic];
  }

  /** Evaluates formulas in dependency order so later ones can reference earlier ones. */
  resolve(formulas: FormulaDefinition[], answers: Record<string, unknown>): Record<string, number> {
    const scope: Record<string, number> = {};
    Object.entries(answers).forEach(([key, raw]) => {
      if (typeof raw === 'number') scope[key] = raw;
      else if (typeof raw === 'boolean') scope[key] = raw ? 1 : 0;
      else if (typeof raw === 'string' && raw.trim() !== '' && Number.isFinite(Number(raw))) {
        scope[key] = Number(raw);
      }
    });

    const cyclic = new Set(this.findCycles(formulas));
    const pending = formulas.filter((formula) => !cyclic.has(formula.key));

    // Repeat until no further formula can be resolved (dependency-order evaluation).
    let progressed = true;
    while (progressed) {
      progressed = false;
      for (let index = pending.length - 1; index >= 0; index -= 1) {
        const formula = pending[index];
        const { value, error } = this.evaluate(formula.expression, scope);
        if (error || value === null) continue;
        scope[formula.key] = value;
        pending.splice(index, 1);
        progressed = true;
      }
    }

    return scope;
  }
}
