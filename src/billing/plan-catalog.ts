import { Plan, UNLIMITED } from './plan.schema';

type SeedPlan = Pick<
  Plan,
  | 'code'
  | 'name'
  | 'tagline'
  | 'currency'
  | 'yearlyPrice'
  | 'trialDays'
  | 'features'
  | 'isPublic'
  | 'isDefault'
  | 'isFeatured'
  | 'isContactSales'
  | 'sortOrder'
> & { limits: Plan['limits'] };

/**
 * The tiers the platform ships with. Seeded once; after that the platform admin
 * edits them in /admin/plans and this file stops being the source of truth —
 * `syncCatalog` only ever *creates* what is missing, never overwrites a price
 * someone has since changed in the dashboard.
 *
 * Prices are paise, charged once a year — the only interval the platform sells.
 */
export const PLAN_CATALOG: SeedPlan[] = [
  {
    code: 'free',
    name: 'Free',
    tagline: 'For trying QuoteProposal out on real quotations.',
    currency: 'INR',
    yearlyPrice: 0,
    trialDays: 0,
    features: [
      '1 user',
      '5 quotations a month',
      '2 templates',
      'PDF export with QuoteProposal badge',
      'Basic share link',
      'Community support',
    ],
    limits: {
      seats: 1,
      quotationsPerMonth: 5,
      templates: 2,
      customers: 25,
      storageMb: 100,
      customBranding: false,
      removeQtnBadge: false,
      apiAccess: false,
      prioritySupport: false,
    },
    isPublic: true,
    isDefault: true,
    isFeatured: false,
    isContactSales: false,
    sortOrder: 10,
  },
  {
    code: 'starter',
    name: 'Starter',
    tagline: 'For a solo operator or a very small business.',
    currency: 'INR',
    yearlyPrice: 199_900,
    trialDays: 14,
    features: [
      'Up to 2 users',
      '30 quotations a month',
      '10 templates',
      'Your logo and colours',
      'Packages, items and customers',
      'Email support',
    ],
    limits: {
      seats: 2,
      quotationsPerMonth: 30,
      templates: 10,
      customers: 500,
      storageMb: 2_000,
      customBranding: true,
      removeQtnBadge: false,
      apiAccess: false,
      prioritySupport: false,
    },
    isPublic: true,
    isDefault: false,
    isFeatured: false,
    isContactSales: false,
    sortOrder: 20,
  },
  {
    code: 'growth',
    name: 'Growth',
    tagline: 'For people who quote every day.',
    currency: 'INR',
    yearlyPrice: 499_900,
    trialDays: 14,
    features: [
      'Up to 5 users',
      'Unlimited quotations',
      '30 templates',
      'No QuoteProposal badge on documents',
      'Reusable blocks',
      'Version history',
      'Approval workflow',
      'Priority support',
    ],
    limits: {
      seats: 5,
      quotationsPerMonth: UNLIMITED,
      templates: 30,
      customers: UNLIMITED,
      storageMb: 20_000,
      customBranding: true,
      removeQtnBadge: true,
      apiAccess: true,
      prioritySupport: true,
    },
    isPublic: true,
    isDefault: false,
    isFeatured: true,
    isContactSales: false,
    sortOrder: 30,
  },
  {
    code: 'business',
    name: 'Business',
    tagline: 'For a team with a workflow to protect.',
    currency: 'INR',
    yearlyPrice: 1_499_900,
    trialDays: 14,
    features: [
      'Up to 15 users',
      'Unlimited quotations and templates',
      'Custom roles and permissions',
      'Audit trail on every document',
      'Team approvals',
      'Full activity history',
      'Shared workspace controls',
      'Faster support',
    ],
    limits: {
      seats: 15,
      quotationsPerMonth: UNLIMITED,
      templates: UNLIMITED,
      customers: UNLIMITED,
      storageMb: 100_000,
      customBranding: true,
      removeQtnBadge: true,
      apiAccess: true,
      prioritySupport: true,
    },
    isPublic: true,
    isDefault: false,
    isFeatured: false,
    isContactSales: false,
    sortOrder: 40,
  },
  {
    /*
     * Priced case by case, so the figures here are zero and never shown. The
     * pricing page reads `isContactSales` and offers a conversation instead of
     * a checkout button; `startCheckout` refuses this plan outright.
     */
    code: 'enterprise',
    name: 'Enterprise',
    tagline: 'For large organisations with their own requirements.',
    currency: 'INR',
    yearlyPrice: 0,
    trialDays: 0,
    features: [
      'Unlimited users',
      'Multi-branch and multi-workspace',
      'SSO',
      'Advanced permissions',
      'Onboarding and migration help',
      'SLA and a dedicated contact',
      'Custom integrations and API limits',
    ],
    limits: {
      seats: UNLIMITED,
      quotationsPerMonth: UNLIMITED,
      templates: UNLIMITED,
      customers: UNLIMITED,
      storageMb: UNLIMITED,
      customBranding: true,
      removeQtnBadge: true,
      apiAccess: true,
      prioritySupport: true,
    },
    isPublic: true,
    isDefault: false,
    isFeatured: false,
    isContactSales: true,
    sortOrder: 50,
  },
];
