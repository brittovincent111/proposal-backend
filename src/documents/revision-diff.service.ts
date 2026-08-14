import { Injectable } from '@nestjs/common';

import { formatMinor } from 'src/template-engine/money';
import { DocumentLine, DocumentSection } from 'src/template-engine/pricing.types';

export interface DiffEntry {
  label: string;
  from: string;
  to: string;
}

export interface RevisionDiff {
  answers: DiffEntry[];
  lines: DiffEntry[];
  totals: DiffEntry[];
  summary: string[];
}

interface RevisionSnapshot {
  inputValuesJson: Record<string, unknown>;
  pricingSnapshotJson: Record<string, unknown>;
  grandTotal: number;
  subtotal: number;
  discountTotal: number;
  taxTotal: number;
}

/**
 * Produces the human-readable "Camera Quantity 16 → 12" summary of map.md §27.
 *
 * Answers, line items and totals only; rich-text diffing is explicitly not an
 * MVP concern there, so paragraph edits show up as "content changed" at most.
 */
@Injectable()
export class RevisionDiffService {
  compare(
    previous: RevisionSnapshot | null,
    next: RevisionSnapshot,
    currency = 'INR',
    locale = 'en-IN',
  ): RevisionDiff {
    if (!previous) {
      return { answers: [], lines: [], totals: [], summary: ['First revision.'] };
    }

    const money = (amount: number) => formatMinor(amount, currency, locale);

    const answers = this.diffAnswers(previous.inputValuesJson, next.inputValuesJson);
    const lines = this.diffLines(
      this.linesOf(previous.pricingSnapshotJson),
      this.linesOf(next.pricingSnapshotJson),
      money,
    );

    const totals: DiffEntry[] = [];
    if (previous.grandTotal !== next.grandTotal) {
      totals.push({
        label: 'Total',
        from: money(previous.grandTotal),
        to: money(next.grandTotal),
      });
    }
    if (previous.discountTotal !== next.discountTotal) {
      totals.push({
        label: 'Discount',
        from: money(previous.discountTotal),
        to: money(next.discountTotal),
      });
    }

    const summary = [...answers, ...lines, ...totals].map(
      (entry) => `${entry.label}: ${entry.from || '—'} → ${entry.to || '—'}`,
    );

    return {
      answers,
      lines,
      totals,
      summary: summary.length ? summary : ['No measurable changes.'],
    };
  }

  private diffAnswers(
    previous: Record<string, unknown>,
    next: Record<string, unknown>,
  ): DiffEntry[] {
    const keys = new Set([...Object.keys(previous), ...Object.keys(next)]);
    const entries: DiffEntry[] = [];

    for (const key of keys) {
      const before = this.stringify(previous[key]);
      const after = this.stringify(next[key]);
      if (before !== after) entries.push({ label: this.humanise(key), from: before, to: after });
    }
    return entries;
  }

  private diffLines(
    previous: DocumentLine[],
    next: DocumentLine[],
    money: (amount: number) => string,
  ): DiffEntry[] {
    // Lines are matched by name: ids are regenerated per revision, so comparing
    // them would report every line as removed and re-added.
    const before = new Map(previous.map((line) => [line.name.toLowerCase(), line]));
    const after = new Map(next.map((line) => [line.name.toLowerCase(), line]));
    const entries: DiffEntry[] = [];

    for (const [key, line] of after) {
      const original = before.get(key);
      if (!original) {
        entries.push({ label: line.name, from: '—', to: `added (${money(line.rate)})` });
        continue;
      }
      if (original.quantity !== line.quantity) {
        entries.push({
          label: `${line.name} quantity`,
          from: `${original.quantity} ${original.unit}`,
          to: `${line.quantity} ${line.unit}`,
        });
      }
      if (original.rate !== line.rate) {
        entries.push({
          label: `${line.name} rate`,
          from: money(original.rate),
          to: money(line.rate),
        });
      }
      if (original.selected !== line.selected && line.optional) {
        entries.push({
          label: `${line.name} (optional)`,
          from: original.selected ? 'included' : 'excluded',
          to: line.selected ? 'included' : 'excluded',
        });
      }
    }

    for (const [key, line] of before) {
      if (!after.has(key)) entries.push({ label: line.name, from: money(line.rate), to: 'removed' });
    }

    return entries;
  }

  private linesOf(snapshot: Record<string, unknown>): DocumentLine[] {
    const sections = (snapshot.sections ?? []) as DocumentSection[];
    return Array.isArray(sections) ? sections.flatMap((section) => section.lines ?? []) : [];
  }

  private stringify(value: unknown): string {
    if (value === null || value === undefined) return '';
    if (Array.isArray(value)) return value.join(', ');
    if (typeof value === 'boolean') return value ? 'Yes' : 'No';
    return String(value);
  }

  private humanise(key: string): string {
    return key.replace(/_/g, ' ').replace(/\b\w/g, (character) => character.toUpperCase());
  }
}
