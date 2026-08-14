import { Discount } from './discount.schema';

type SeedDiscount = Pick<
  Discount,
  | 'name'
  | 'code'
  | 'autoApply'
  | 'planCodes'
  | 'type'
  | 'value'
  | 'duration'
  | 'eligibility'
  | 'maxRedemptions'
  | 'startsAt'
  | 'endsAt'
  | 'stackable'
  | 'internalNote'
  | 'status'
>;

/**
 * The offers the platform ships with, seeded once and then owned by the admin
 * console — same insert-only rule as the plan catalogue, so editing a live
 * offer's dates in /admin is not undone by the next deploy.
 *
 * They start INACTIVE on purpose. A discount that switches itself on at deploy
 * time is a discount nobody decided to run.
 */
export const DISCOUNT_PRESETS: SeedDiscount[] = [
  {
    name: 'Founding Customer Offer',
    code: 'FOUNDER50',
    autoApply: false,
    planCodes: ['starter', 'growth', 'business'],
    // OVERRIDE cannot express three different fixed prices in one row, so the
    // launch pricing is per plan: this row carries Starter's, and the sibling
    // rows below carry Growth's and Business's.
    type: 'OVERRIDE',
    value: 150_000,
    duration: 'FIRST_PAYMENT',
    eligibility: 'NEW_ONLY',
    maxRedemptions: 100,
    startsAt: null,
    endsAt: new Date('2026-10-31T23:59:59.000Z'),
    stackable: false,
    internalNote: 'Launch offer. Starter at ₹1,500/yr for the first 100 paying customers.',
    status: 'INACTIVE',
  },
  {
    name: 'Founding Customer Offer — Growth',
    code: 'FOUNDER50GROWTH',
    autoApply: false,
    planCodes: ['growth'],
    type: 'OVERRIDE',
    value: 250_000,
    duration: 'FIRST_PAYMENT',
    eligibility: 'NEW_ONLY',
    maxRedemptions: 100,
    startsAt: null,
    endsAt: new Date('2026-10-31T23:59:59.000Z'),
    stackable: false,
    internalNote: 'Launch offer. Growth at ₹2,500/yr.',
    status: 'INACTIVE',
  },
  {
    name: 'Founding Customer Offer — Business',
    code: 'FOUNDER50BUSINESS',
    autoApply: false,
    planCodes: ['business'],
    type: 'OVERRIDE',
    value: 999_900,
    duration: 'FIRST_PAYMENT',
    eligibility: 'NEW_ONLY',
    maxRedemptions: 100,
    startsAt: null,
    endsAt: new Date('2026-10-31T23:59:59.000Z'),
    stackable: false,
    internalNote: 'Launch offer. Business at ₹9,999/yr.',
    status: 'INACTIVE',
  },
  {
    name: 'Launch 30% off annual',
    code: 'LAUNCH30',
    autoApply: false,
    planCodes: ['starter', 'growth'],
    type: 'PERCENT',
    value: 30,
    duration: 'FIRST_PAYMENT',
    eligibility: 'ALL',
    maxRedemptions: 0,
    startsAt: null,
    endsAt: null,
    stackable: false,
    internalNote: '30% off the first annual payment on Starter and Growth.',
    status: 'INACTIVE',
  },
  {
    name: 'Annual saving',
    code: 'SAVE20YEARLY',
    // No offer applies itself. A discount nobody typed is a discount nobody
    // decided to give, and it silently reprices every annual checkout.
    autoApply: false,
    planCodes: [],
    type: 'PERCENT',
    value: 20,
    duration: 'LIFETIME',
    eligibility: 'ALL',
    maxRedemptions: 0,
    startsAt: null,
    endsAt: null,
    stackable: false,
    internalNote: 'Give the code to customers who ask about annual pricing.',
    status: 'INACTIVE',
  },
  {
    name: 'Team upgrade — 2 months off Business',
    code: 'TEAMUPGRADE',
    autoApply: false,
    planCodes: ['business'],
    // Two months of a twelve-month year.
    type: 'PERCENT',
    value: 17,
    duration: 'FIRST_PAYMENT',
    eligibility: 'ALL',
    maxRedemptions: 0,
    startsAt: null,
    endsAt: null,
    stackable: false,
    internalNote: 'Roughly two months free on an annual Business subscription.',
    status: 'INACTIVE',
  },
  {
    name: 'Win-back',
    code: 'WINBACK25',
    autoApply: false,
    planCodes: [],
    type: 'PERCENT',
    value: 25,
    duration: 'MONTHS_3',
    eligibility: 'ALL',
    maxRedemptions: 0,
    startsAt: null,
    endsAt: null,
    stackable: false,
    internalNote: 'For expired trials. Send the code directly rather than listing it.',
    status: 'INACTIVE',
  },
];
