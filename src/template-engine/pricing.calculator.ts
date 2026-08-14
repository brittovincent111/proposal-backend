import { Injectable } from '@nestjs/common';

import { FormulaEngine } from './formula.engine';
import {
  Minor,
  clampNonNegative,
  distribute,
  multiplyQuantity,
  percentOf,
  roundOffDelta,
  taxWithin,
} from './money';
import {
  Discount,
  DocumentLine,
  DocumentTotals,
  LineTotals,
  PricingInput,
  TaxRateSnapshot,
  TaxSummaryRow,
} from './pricing.types';

/** Lines that only carry text never contribute money. */
export function isPricedLine(line: DocumentLine): boolean {
  return line.kind === 'ITEM' || line.kind === 'CUSTOM';
}

@Injectable()
export class PricingCalculator {
  constructor(private readonly formulas: FormulaEngine) {}

  /**
   * The gross amount for one line, before discounts and tax.
   * `runningSubtotal` is what PERCENTAGE lines are a percentage of.
   */
  lineGross(line: DocumentLine, runningSubtotal: Minor, scope: Record<string, number>): Minor {
    if (!isPricedLine(line)) return 0;

    switch (line.pricingMode) {
      case 'FIXED':
        return clampNonNegative(line.rate);
      case 'QUANTITY_RATE':
        return clampNonNegative(multiplyQuantity(line.rate, line.quantity));
      case 'QUANTITY_RATE_DAYS':
        return clampNonNegative(
          multiplyQuantity(multiplyQuantity(line.rate, line.quantity), line.days),
        );
      case 'AREA_RATE':
      case 'HOURS_RATE':
        return clampNonNegative(multiplyQuantity(line.rate, line.quantity));
      case 'PERCENTAGE':
        return clampNonNegative(percentOf(runningSubtotal, line.percent));
      case 'FORMULA': {
        const { value, error } = this.formulas.evaluate(line.formula, scope);
        if (error || value === null) return 0;
        return clampNonNegative(Math.round(value * 100));
      }
      case 'MANUAL':
        return clampNonNegative(line.manualAmount);
      default:
        return 0;
    }
  }

  /**
   * Full document math — the authoritative version (map.md §49: the frontend may
   * preview, the server decides).
   *
   * Order: line gross → line discount → document discount spread proportionally
   * across taxable lines → tax per line → charges → round off. Spreading the
   * overall discount before tax is what keeps the tax summary correct; taking it
   * off the grand total instead would over-charge tax.
   */
  calculate(input: PricingInput): DocumentTotals {
    const { sections, taxRates, overallDiscount, charges, taxInclusive, roundOff } = input;
    const taxById = new Map<string, TaxRateSnapshot>(taxRates.map((rate) => [rate.id, rate]));

    const allLines = sections.flatMap((section) => section.lines);
    const priced = allLines.filter(isPricedLine);

    // Pass 1 — gross per line, with a running subtotal for PERCENTAGE lines.
    const scope: Record<string, number> = { ...(input.scope ?? {}) };
    const gross = new Map<string, Minor>();
    let runningSubtotal = 0;

    for (const line of priced) {
      const amount = this.lineGross(line, runningSubtotal, scope);
      gross.set(line.id, amount);
      if (!line.optional || line.selected) runningSubtotal += amount;
      scope[`line_${line.id.replace(/[^a-z0-9_]/gi, '_').toLowerCase()}`] = amount / 100;
      scope.subtotal = runningSubtotal / 100;
    }

    // Pass 2 — line discounts. Excluded lines are computed but never counted.
    const isExcluded = (line: DocumentLine) => line.optional && !line.selected;

    const afterLineDiscount = new Map<string, Minor>();
    const lineDiscounts = new Map<string, Minor>();
    let subtotal = 0;
    let lineDiscountTotal = 0;

    for (const line of priced) {
      const amount = gross.get(line.id) ?? 0;
      const discount = this.discountAmount(amount, line.discount);
      lineDiscounts.set(line.id, discount);
      afterLineDiscount.set(line.id, amount - discount);
      if (!isExcluded(line)) {
        subtotal += amount;
        lineDiscountTotal += discount;
      }
    }

    // Pass 3 — document-level discount, allocated by each line's share.
    const included = priced.filter((line) => !isExcluded(line));
    const base = included.reduce((sum, line) => sum + (afterLineDiscount.get(line.id) ?? 0), 0);
    const overallDiscountTotal = this.discountAmount(base, overallDiscount);
    const allocations = distribute(
      overallDiscountTotal,
      included.map((line) => afterLineDiscount.get(line.id) ?? 0),
    );
    const allocatedById = new Map<string, Minor>(
      included.map((line, index) => [line.id, allocations[index] ?? 0]),
    );

    // Pass 4 — tax per line, and the grouped summary.
    const lines: Record<string, LineTotals> = {};
    const summary = new Map<string, TaxSummaryRow>();
    let taxTotal = 0;
    let optionalTotal = 0;

    for (const line of priced) {
      const excluded = isExcluded(line);
      const grossAmount = gross.get(line.id) ?? 0;
      const lineDiscount = lineDiscounts.get(line.id) ?? 0;
      const allocated = allocatedById.get(line.id) ?? 0;
      const net = clampNonNegative(grossAmount - lineDiscount - allocated);

      const rate = line.taxRateId ? taxById.get(line.taxRateId) : undefined;
      const percent = rate?.percent ?? 0;

      // With inclusive pricing the entered rate already contains the tax.
      const containedTax = taxInclusive ? taxWithin(net, percent) : 0;
      const taxable = taxInclusive ? net - containedTax : net;
      const tax = taxInclusive ? containedTax : percentOf(taxable, percent);

      lines[line.id] = {
        lineId: line.id,
        gross: grossAmount,
        lineDiscount,
        allocatedDiscount: allocated,
        taxable,
        tax,
        total: taxable + tax,
        excluded,
      };

      if (excluded) {
        optionalTotal += net + (taxInclusive ? 0 : percentOf(net, percent));
        continue;
      }

      taxTotal += tax;

      if (percent > 0 && rate) {
        const components = rate.components.length
          ? rate.components
          : [{ name: rate.name, percent: rate.percent }];
        for (const component of components) {
          const key = `${component.name}@${component.percent}`;
          const share = percent === 0 ? 0 : Math.round((tax * component.percent) / percent);
          const existing = summary.get(key);
          if (existing) {
            existing.taxable += taxable;
            existing.tax += share;
          } else {
            summary.set(key, {
              name: component.name,
              percent: component.percent,
              taxable,
              tax: share,
            });
          }
        }
      }
    }

    const chargesTotal = charges.reduce((sum, charge) => sum + charge.amount, 0);
    const beforeRounding = clampNonNegative(
      subtotal -
        lineDiscountTotal -
        overallDiscountTotal +
        (taxInclusive ? 0 : taxTotal) +
        chargesTotal,
    );
    const roundOffAdjustment = roundOff ? roundOffDelta(beforeRounding) : 0;

    return {
      lines,
      subtotal,
      lineDiscountTotal,
      overallDiscountTotal,
      discountTotal: lineDiscountTotal + overallDiscountTotal,
      taxTotal,
      taxSummary: [...summary.values()].sort((a, b) => a.name.localeCompare(b.name)),
      chargesTotal,
      roundOffAdjustment,
      grandTotal: beforeRounding + roundOffAdjustment,
      optionalTotal,
    };
  }

  private discountAmount(base: Minor, discount: Discount | undefined): Minor {
    if (!discount || base <= 0) return 0;
    const raw =
      discount.mode === 'PERCENT'
        ? percentOf(base, discount.value)
        : Math.round(discount.value * 100);
    return Math.min(clampNonNegative(raw), base);
  }
}
