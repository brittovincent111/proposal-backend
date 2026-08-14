import { Minor } from './money';

/** map.md §19 — pricing without becoming accounting software. */
export const PricingModes = [
  'FIXED',
  'QUANTITY_RATE',
  'QUANTITY_RATE_DAYS',
  'AREA_RATE',
  'HOURS_RATE',
  'PERCENTAGE',
  'FORMULA',
  'MANUAL',
] as const;
export type PricingMode = (typeof PricingModes)[number];

export const DiscountModes = ['PERCENT', 'AMOUNT'] as const;
export type DiscountMode = (typeof DiscountModes)[number];

export interface Discount {
  mode: DiscountMode;
  /** Percent (0–100) when mode is PERCENT, else major currency units. */
  value: number;
}

export interface TaxComponent {
  name: string;
  percent: number;
}

export interface TaxRateSnapshot {
  id: string;
  name: string;
  percent: number;
  /** GST splits into CGST + SGST on the printed summary; empty means a single line. */
  components: TaxComponent[];
}

export const LineKinds = ['ITEM', 'CUSTOM', 'HEADING', 'NOTE'] as const;
export type LineKind = (typeof LineKinds)[number];

/**
 * A document line. Everything the customer sees is snapshotted here — the line
 * never reads back through `itemId` for display, so editing the item master
 * later cannot rewrite a historical document (map.md §29, §70, §72).
 */
export interface DocumentLine {
  id: string;
  kind: LineKind;
  /** Provenance only: analytics and "item price changed" hints. Never used for display. */
  itemId?: string | null;
  packageId?: string | null;
  packageName?: string;

  name: string;
  description: string;
  unit: string;

  pricingMode: PricingMode;
  quantity: number;
  days: number;
  rate: Minor;
  /** For PERCENTAGE mode: percent of the section subtotal above this line. */
  percent: number;
  /** For FORMULA mode: an expression over answers and earlier lines, parsed not evaluated. */
  formula: string;
  /** For MANUAL mode: the amount the user typed. */
  manualAmount: Minor;

  discount: Discount;
  taxRateId: string | null;

  /** Optional lines are quoted but excluded from the total until selected — map.md §24. */
  optional: boolean;
  selected: boolean;
}

export interface DocumentSection {
  id: string;
  title: string;
  lines: DocumentLine[];
}

export interface ExtraCharge {
  id: string;
  label: string;
  amount: Minor;
}

export interface PricingInput {
  sections: DocumentSection[];
  taxRates: TaxRateSnapshot[];
  /** Discount applied to the whole document, spread across lines so tax stays correct. */
  overallDiscount: Discount;
  charges: ExtraCharge[];
  /** When true, entered rates already contain tax. */
  taxInclusive: boolean;
  roundOff: boolean;
  /** Answers and resolved formulas, exposed to FORMULA lines in major units. */
  scope?: Record<string, number>;
}

export interface LineTotals {
  lineId: string;
  /** quantity × rate (or whatever the pricing mode dictates), before any discount. */
  gross: Minor;
  lineDiscount: Minor;
  /** This line's share of the document-level discount. */
  allocatedDiscount: Minor;
  taxable: Minor;
  tax: Minor;
  total: Minor;
  excluded: boolean;
}

export interface TaxSummaryRow {
  name: string;
  percent: number;
  taxable: Minor;
  tax: Minor;
}

export interface DocumentTotals {
  lines: Record<string, LineTotals>;
  subtotal: Minor;
  lineDiscountTotal: Minor;
  overallDiscountTotal: Minor;
  discountTotal: Minor;
  taxTotal: Minor;
  taxSummary: TaxSummaryRow[];
  chargesTotal: Minor;
  roundOffAdjustment: Minor;
  grandTotal: Minor;
  /** Quoted but not selected — shown separately so upsells stay visible. */
  optionalTotal: Minor;
}

export function emptyTotals(): DocumentTotals {
  return {
    lines: {},
    subtotal: 0,
    lineDiscountTotal: 0,
    overallDiscountTotal: 0,
    discountTotal: 0,
    taxTotal: 0,
    taxSummary: [],
    chargesTotal: 0,
    roundOffAdjustment: 0,
    grandTotal: 0,
    optionalTotal: 0,
  };
}
