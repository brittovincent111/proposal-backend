/**
 * Demo content for `npm run seed` — map.md §88.
 *
 * A travel template because it exercises everything at once: conditional blocks,
 * a formula over two questions, a package with priced items, and optional lines.
 */
export const SEED_ORGANIZATION = {
  name: 'ABC Travels',
  ownerEmail: 'owner@abctravels.test',
  ownerPassword: 'seed-password-123',
};

export const SEED_ITEMS = [
  {
    name: 'Innova Crysta (per day)',
    description: 'Air-conditioned SUV with driver, fuel and tolls included.',
    type: 'SERVICE' as const,
    category: 'Transport',
    unit: 'day',
    defaultRate: 450_000,
  },
  {
    name: 'Deluxe room (per night)',
    description: 'Double occupancy with breakfast.',
    type: 'SERVICE' as const,
    category: 'Accommodation',
    unit: 'night',
    defaultRate: 380_000,
  },
  {
    name: 'Houseboat stay (per night)',
    description: 'Private houseboat with all meals.',
    type: 'SERVICE' as const,
    category: 'Accommodation',
    unit: 'night',
    defaultRate: 950_000,
  },
  {
    name: 'Guided plantation tour',
    description: 'Half-day walking tour with a local guide.',
    type: 'SERVICE' as const,
    category: 'Activities',
    unit: 'nos',
    defaultRate: 150_000,
  },
];

export const SEED_PACKAGE = {
  name: 'Munnar & Alleppey — 3N/4D',
  description: 'Hill station and backwaters, deluxe category.',
  category: 'Kerala',
  pricingMode: 'SUM_OF_ITEMS' as const,
};

export const SEED_TEMPLATE = {
  name: 'Kerala tour proposal',
  description: 'Standard proposal for domestic leisure trips with package-based pricing.',
  category: 'Proposal',
  industry: 'Travel',
  fieldSchemaJson: {
    schemaVersion: 1,
    groups: ['Trip', 'Guests', 'Preferences'],
    fields: [
      { id: 'f1', key: 'destination', label: 'Destination', type: 'TEXT', group: 'Trip', required: true, options: [], condition: null, description: '', placeholder: 'Munnar & Alleppey', defaultValue: '' },
      { id: 'f2', key: 'travel_date', label: 'Travel date', type: 'DATE', group: 'Trip', required: true, options: [], condition: null, description: '', placeholder: '', defaultValue: '' },
      { id: 'f3', key: 'nights', label: 'Nights', type: 'NUMBER', group: 'Trip', required: true, options: [], condition: null, description: '', placeholder: '3', defaultValue: '3' },
      { id: 'f4', key: 'adults', label: 'Adults', type: 'NUMBER', group: 'Guests', required: true, options: [], condition: null, description: '', placeholder: '2', defaultValue: '2' },
      { id: 'f5', key: 'children', label: 'Children', type: 'NUMBER', group: 'Guests', required: false, options: [], condition: null, description: '', placeholder: '0', defaultValue: '0' },
      { id: 'f6', key: 'hotel_category', label: 'Hotel category', type: 'SELECT', group: 'Preferences', required: true, options: ['Standard', 'Deluxe', 'Luxury'], condition: null, description: '', placeholder: '', defaultValue: 'Deluxe' },
      { id: 'f7', key: 'needs_airport_pickup', label: 'Airport pickup needed?', type: 'BOOLEAN', group: 'Preferences', required: false, options: [], condition: null, description: '', placeholder: '', defaultValue: '' },
      { id: 'f8', key: 'arrival_flight', label: 'Arrival flight number', type: 'TEXT', group: 'Preferences', required: true, options: [], description: '', placeholder: 'AI 501', defaultValue: '',
        // Only asked when the guest actually wants a pickup.
        condition: { mode: 'all', rules: [{ id: 'r1', field: 'needs_airport_pickup', operator: 'EQ', value: 'true' }] } },
    ],
    formulas: [
      { id: 'c1', key: 'total_guests', label: 'Total guests', expression: 'adults + children' },
      { id: 'c2', key: 'total_days', label: 'Total days', expression: 'nights + 1' },
    ],
  },
  schemaJson: {
    schemaVersion: 1,
    blocks: [
      { id: 'b1', type: 'heading', label: 'Title', content: '{{destination}} — {{nights}} nights for {{total_guests}} guests', items: [], align: 'left', spacing: 'normal', emphasis: 'strong', condition: null },
      { id: 'b2', type: 'text', label: 'Intro', content: 'Dear {{customer_name}}, thank you for the opportunity. Here is our proposal for your {{destination}} trip departing {{travel_date}}.', items: [], align: 'left', spacing: 'normal', emphasis: 'normal', condition: null },
      { id: 'b3', type: 'table', label: 'Trip summary', content: '', items: ['Destination | {{destination}}', 'Travel date | {{travel_date}}', 'Duration | {{nights}} nights / {{total_days}} days', 'Guests | {{total_guests}}', 'Hotel category | {{hotel_category}}'], align: 'left', spacing: 'normal', emphasis: 'normal', condition: null },
      { id: 'b4', type: 'text', label: 'Airport pickup', content: 'We will meet you at arrivals for flight {{arrival_flight}}.', items: [], align: 'left', spacing: 'normal', emphasis: 'normal',
        condition: { mode: 'all', rules: [{ id: 'r1', field: 'needs_airport_pickup', operator: 'EQ', value: 'true' }] } },
      { id: 'b5', type: 'repeatingList', label: 'Trip highlights', content: '', items: ['Arrival and drive to Munnar', 'Munnar sightseeing', 'Alleppey houseboat stay', 'Departure transfer'], align: 'left', spacing: 'normal', emphasis: 'normal', condition: null },
      { id: 'b6', type: 'pricingTable', label: 'Pricing', content: '', items: [], align: 'left', spacing: 'normal', emphasis: 'normal', condition: null },
      { id: 'b7', type: 'repeatingList', label: 'Travel notes', content: '', items: ['Accommodation as listed', 'Daily breakfast', 'Transfers are priced from package items'], align: 'left', spacing: 'normal', emphasis: 'normal', condition: null },
      { id: 'b9', type: 'terms', label: 'Terms & conditions', content: '', items: ['50% advance confirms the booking', 'Balance due 7 days before travel', 'Rates are subject to availability at the time of confirmation'], align: 'left', spacing: 'normal', emphasis: 'normal', condition: null },
    ],
  },
  settingsJson: {
    defaultValidityDays: 15,
    defaultTaxInclusive: null,
    defaultRoundOff: null,
    defaultTerms: '50% advance confirms the booking. Balance due 7 days before travel.',
    defaultPaymentTerms: 'Bank transfer or UPI. GST as applicable.',
  },
};

export const SEED_CUSTOMER = {
  type: 'INDIVIDUAL' as const,
  name: 'Ravi Menon',
  companyName: '',
  email: 'ravi.menon@example.test',
  phone: '+91 98470 11111',
  billingAddress: {
    line1: '14 Marine Drive',
    line2: '',
    city: 'Kochi',
    state: 'Kerala',
    postalCode: '682011',
    country: 'India',
  },
};
