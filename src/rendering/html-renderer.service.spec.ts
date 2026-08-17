import {
  CompiledProposal,
  CompiledQuotation,
  ResolvedBlock,
} from 'src/template-engine/document.compiler';
import { emptyTotals } from 'src/template-engine/pricing.types';
import { HtmlRendererService } from './html-renderer.service';

describe('HtmlRendererService', () => {
  const renderer = new HtmlRendererService();

  const heading: ResolvedBlock = {
    id: 'b1',
    type: 'heading',
    label: '',
    content: 'Your Kerala itinerary',
    items: [],
    align: 'left',
    spacing: 'normal',
    emphasis: 'normal',
  };

  const pricing = () =>
    ({
        sections: [
          {
            id: 's1',
            title: 'Stay',
            lines: [
              {
                id: 'l1',
                kind: 'ITEM',
                name: 'Houseboat, 1 night',
                description: 'Deluxe, all meals',
                unit: 'night',
                pricingMode: 'QUANTITY_RATE',
                quantity: 2,
                days: 1,
                rate: 1_200_000,
                percent: 0,
                formula: '',
                manualAmount: 0,
                taxRateId: null,
                taxPercent: 0,
                discount: { mode: 'PERCENT', value: 0 },
                optional: false,
                selected: true,
              },
            ],
          },
        ],
      totals: { ...emptyTotals(), subtotal: 2_400_000, grandTotal: 2_400_000 },
      currency: 'INR',
      locale: 'en-IN',
      taxInclusive: false,
    }) as unknown as CompiledQuotation['pricing'];

  const meta = () =>
    ({
        documentNumber: 'Q-2026-00002',
        documentDate: new Date('2026-08-10T00:00:00Z'),
        validUntil: new Date('2026-08-25T00:00:00Z'),
        currency: 'INR',
        locale: 'en-IN',
        title: '14 days tour package',
        reference: 'ENQ-771',
        visibleFieldKeys: [],
        customer: {
          name: 'Rahul Nair',
          companyName: 'Nair Family',
          email: 'rahul@example.com',
          phone: '+91 99887 77665',
          billingAddress: '14 Richmond Road, Bengaluru',
        },
        company: {
          name: 'Atlas Journeys',
          address: 'Kochi, Kerala',
          phone: '+91 90000 00000',
          email: 'hello@atlas.example.com',
          website: 'atlas.example.com',
          taxNumber: '32AABCA1234F1Z5',
          logoUrl: null,
          accentColor: '#0f6a63',
        },
      terms: 'Cancellation within 7 days is non-refundable.',
      paymentTerms: '50% advance, balance before arrival.',
      customerNotes: 'Airport pickup included.',
    }) as CompiledQuotation['meta'];

  const style = () =>
    ({
      accentColor: '#2563eb',
      fontFamily: 'Inter',
      pageSize: 'A4',
      headerText: '',
      footerText: '',
      showLogo: true,
      showPageNumbers: true,
    }) as CompiledQuotation['style'];

  /** A priced document: the fixed layout, no blocks, no authored body. */
  const quotation = (overrides: Partial<CompiledQuotation> = {}): CompiledQuotation => ({
    kind: 'QUOTATION',
    schemaVersion: 1,
    pricing: pricing(),
    meta: meta(),
    style: style(),
    ...overrides,
  });

  /** An authored document: blocks or a body, and never a price anywhere. */
  const proposal = (overrides: Partial<CompiledProposal> = {}): CompiledProposal => ({
    kind: 'PROPOSAL',
    schemaVersion: 1,
    blocks: [heading],
    meta: meta(),
    style: style(),
    ...overrides,
  });

  /** The markup alone: the inlined stylesheet mentions most attributes by name. */
  const markup = (html: string) => html.replace(/<style>[\s\S]*?<\/style>/g, '');

  it('renders the letterhead, the parties and the document meta', () => {
    const html = renderer.render(quotation());

    expect(html).toContain('Atlas Journeys');
    expect(html).toContain('Q-2026-00002');
    expect(html).toContain('14 days tour package');
    expect(html).toContain('Prepared for');
    expect(html).toContain('Nair Family');
    expect(html).toMatch(/10[\s-]Aug[\s-]2026/);
    expect(html).toMatch(/25[\s-]Aug[\s-]2026/);
    expect(html).toContain('ENQ-771');
    // No logo uploaded, so the brand falls back to a monogram.
    expect(html).toContain('<div class="qtn-monogram">AJ</div>');
  });

  it('prints the notes and terms held on the document', () => {
    const html = renderer.render(quotation());

    expect(html).toContain('Airport pickup included.');
    expect(html).toContain('50% advance, balance before arrival.');
    expect(html).toContain('Cancellation within 7 days is non-refundable.');
  });

  it('ships its own stylesheet so the preview, public page and print agree', () => {
    const html = renderer.render(quotation());

    expect(html).toContain('<style>');
    expect(html).toContain('@page { size: A4;');
    expect(html).toContain('.qtn-pricing thead { display: table-header-group; }');
  });

  it('keeps fixed-height layout image columns stretched in rendered previews', () => {
    const html = renderer.render(quotation());

    expect(html).toContain(
      '.qtn-block--document [data-layout-block][data-layout-min-height] > [data-layout-column] > p:has(> span[data-image-frame="true"]) > span[data-image-frame="true"] > img {',
    );
    expect(html).toContain(
      '.qtn-block--document [data-layout-block] > [data-layout-column] > p > span:has(> span[data-image-frame="true"]) > span[data-image-frame="true"] {',
    );
    expect(html).toContain('height: 100% !important;');
  });

  it('falls back to the brand colour when the template kept the schema default', () => {
    const html = renderer.render(quotation());
    expect(html).toContain('--qtn-accent: #0f6a63');
  });

  it("lets a template's own accent win over the brand colour", () => {
    const html = renderer.render(
      quotation({
        style: { ...quotation().style, accentColor: '#b4271b' },
      }),
    );
    expect(html).toContain('--qtn-accent: #b4271b');
  });

  it('refuses a colour that is not a plain hex literal', () => {
    const html = renderer.render(
      quotation({
        style: { ...quotation().style, accentColor: 'red; } body { display: none } .x {' },
      }),
    );

    expect(html).toContain('--qtn-accent: #0f6a63');
    expect(html).not.toContain('display: none');
  });

  it('ignores an unknown font rather than writing it into CSS', () => {
    const html = renderer.render(
      quotation({
        style: { ...quotation().style, fontFamily: 'Comic Sans"; behavior: url(x)' },
      }),
    );

    expect(html).not.toContain('behavior');
    expect(html).toContain("font-family: 'Inter'");
  });

  it('escapes company and customer text', () => {
    const base = proposal();
    const html = renderer.render({
      ...base,
      meta: {
        ...base.meta,
        company: { ...base.meta.company, name: '<script>alert(1)</script>Acme' },
      },
    });

    expect(html).not.toContain('<script>');
    expect(html).toContain('Acme');
  });

  it('honours LETTER page size in the print rule', () => {
    const html = renderer.render(
      quotation({ style: { ...quotation().style, pageSize: 'LETTER' } }),
    );
    expect(html).toContain('@page { size: Letter;');
  });

  it('renderPage wraps the document as a standalone HTML file', () => {
    const html = renderer.renderPage(quotation());

    expect(html.startsWith('<!doctype html>')).toBe(true);
    expect(html).toContain('<title>14 days tour package</title>');
    expect(html).toContain('class="qtn-document"');
  });

  it('renders a revision whose dates came back from JSON as strings', () => {
    const base = proposal();
    const html = renderer.render({
      ...base,
      meta: {
        ...base.meta,
        documentDate: '2026-08-10T00:00:00.000Z' as unknown as Date,
        validUntil: '2026-08-25T00:00:00.000Z' as unknown as Date,
      },
    });

    expect(html).toMatch(/10[\s-]Aug[\s-]2026/);
  });

  describe('page structure', () => {
    it('marks only the block asked to start a new page', () => {
      const base = proposal();
      const html = renderer.render({
        ...base,
        blocks: [
          { ...base.blocks[0], id: 'intro', newPage: false },
          { ...base.blocks[0], id: 'appendix', content: 'Appendix', newPage: true },
        ],
      });

      expect(/id="intro"[^>]*data-new-page/.test(html)).toBe(false);
      expect(/id="appendix"[^>]*data-new-page="true"/.test(html)).toBe(true);
    });

    it('breaks before it on paper and shows a marker on screen', () => {
      const html = renderer.render(quotation());

      expect(html).toContain('break-before: page');
      expect(html).toContain('content: "New page"');
      // The manual page-break block keeps working alongside it.
      expect(html).toContain('break-after: page');
    });

    it('leaves a revision compiled before this feature alone', () => {
      // `newPage` is absent entirely, as an older resolvedDocumentJson has it.
      const html = renderer.render(quotation());

      expect(/id="b1"[^>]*data-new-page/.test(html)).toBe(false);
      expect(/id="b2"[^>]*data-new-page/.test(html)).toBe(false);
    });

    it('renders generic field blocks as labelled value cards', () => {
      const base = proposal();
      const html = renderer.render({
        ...base,
        blocks: [
          {
            id: 'destination',
            type: 'shortTextField',
            label: 'Destination',
            content: 'Munnar',
            items: [],
            align: 'left',
            spacing: 'normal',
            emphasis: 'normal',
          },
        ],
      });

      expect(html).toContain('qtn-field');
      expect(html).toContain('Destination');
      expect(html).toContain('Munnar');
    });

    it('renders generic repeating lists with the standard list style', () => {
      const base = proposal();
      const html = renderer.render({
        ...base,
        blocks: [
          {
            id: 'included',
            type: 'repeatingList',
            label: 'Included',
            content: '',
            items: ['Airport pickup', 'Breakfast'],
            align: 'left',
            spacing: 'normal',
            emphasis: 'normal',
          },
        ],
      });

      expect(html).toContain('Airport pickup');
      expect(html).toContain('Breakfast');
      expect(html).toContain('qtn-list');
    });
  });

  describe('a document-authored body', () => {
    it('prints the authored body alone, with no prices anywhere', () => {
      const html = renderer.render(
        proposal({ body: '<h1>Proposal</h1><p>Our scope of work.</p>' }),
      );

      expect(html).toContain('<h1>Proposal</h1>');
      expect(html).toContain('Our scope of work.');
      // The body owns the page, so the fixture's block heading does not print.
      expect(html).not.toContain('Your Kerala itinerary');
      // The closing still follows: notes and terms belong to a proposal too.
      expect(html).toContain('Airport pickup included.');
      expect(html).toContain('Cancellation within 7 days is non-refundable.');
      // No pricing appendix bolted on the end any more. That function existed to
      // give a narrative document its commercial table; the hard wall says a
      // proposal never gets one.
      expect(html).not.toContain('<table class="qtn-pricing">');
      expect(html).not.toContain('Houseboat, 1 night');
      expect(markup(html)).not.toContain('data-new-page="true"');
    });

    it('never expands an item-table marker into a priced table', () => {
      // The sanitiser stops the marker being stored in the first place (see
      // document-body.spec) — this is the renderer's half: even handed one, it
      // has no expander left, so the div passes through inert rather than
      // becoming prices on a proposal.
      const html = renderer.render(
        proposal({ body: '<p>Scope</p><div data-item-table="true"></div>' }),
      );

      expect(html).toContain('Scope');
      expect(html).not.toContain('<table class="qtn-pricing">');
      expect(html).not.toContain('Houseboat, 1 night');
    });
  });

  describe('the quotation layout', () => {
    it('prints the full letterhead, the table and the closing, starting on page 1', () => {
      const html = renderer.render(quotation());

      expect(html).toContain('<header class="qtn-letterhead">');
      expect(html).toContain('<table class="qtn-pricing">');
      expect(html).toContain('Houseboat, 1 night');
      expect(html).toContain('₹24,000.00');
      // The appendix used to force a break because it followed narrative pages.
      // As the whole document it must not, or the PDF opens on a blank sheet.
      expect(markup(html)).not.toContain('data-new-page="true"');
    });

    it('carries the company address and tax number a tax document needs', () => {
      // renderCommercialHeader, the compact continuation header, omitted both.
      // Using it as the standalone layout would have shipped quotations without
      // a registered address or a GSTIN on them.
      const html = renderer.render(quotation());

      expect(html).toContain('Kochi, Kerala');
      expect(html).toContain('32AABCA1234F1Z5');
    });

    it('labels each kind as what it is', () => {
      expect(renderer.render(quotation())).toContain('<p class="qtn-doctype">Quotation</p>');
      expect(renderer.render(proposal())).toContain('<p class="qtn-doctype">Proposal</p>');
    });
  });
});
