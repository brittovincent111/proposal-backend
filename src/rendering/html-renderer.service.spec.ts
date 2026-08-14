import { CompiledDocument } from 'src/template-engine/document.compiler';
import { emptyTotals } from 'src/template-engine/pricing.types';
import { HtmlRendererService } from './html-renderer.service';

describe('HtmlRendererService', () => {
  const renderer = new HtmlRendererService();

  const compiled = (overrides: Partial<CompiledDocument> = {}): CompiledDocument =>
    ({
      schemaVersion: 1,
      blocks: [
        {
          id: 'b1',
          type: 'heading',
          label: '',
          content: 'Your Kerala itinerary',
          items: [],
          align: 'left',
          spacing: 'normal',
          emphasis: 'normal',
        },
        {
          id: 'b2',
          type: 'pricingTable',
          label: '',
          content: '',
          items: [],
          align: 'left',
          spacing: 'normal',
          emphasis: 'normal',
        },
      ],
      pricing: {
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
      },
      meta: {
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
      },
      style: {
        accentColor: '#2563eb',
        fontFamily: 'Inter',
        pageSize: 'A4',
        headerText: '',
        footerText: '',
        showLogo: true,
        showPageNumbers: true,
      },
      ...overrides,
    }) as CompiledDocument;

  it('renders the letterhead, the parties and the document meta', () => {
    const html = renderer.render(compiled());

    expect(html).toContain('Atlas Journeys');
    expect(html).toContain('Q-2026-00002');
    expect(html).toContain('14 days tour package');
    expect(html).toContain('Prepared for');
    expect(html).toContain('Nair Family');
    expect(html).toContain('10 Aug 2026');
    expect(html).toContain('25 Aug 2026');
    expect(html).toContain('ENQ-771');
    // No logo uploaded, so the brand falls back to a monogram.
    expect(html).toContain('<div class="qtn-monogram">AJ</div>');
  });

  it('prints the notes and terms held on the document', () => {
    const html = renderer.render(compiled());

    expect(html).toContain('Airport pickup included.');
    expect(html).toContain('50% advance, balance before arrival.');
    expect(html).toContain('Cancellation within 7 days is non-refundable.');
  });

  it('ships its own stylesheet so the preview, public page and print agree', () => {
    const html = renderer.render(compiled());

    expect(html).toContain('<style>');
    expect(html).toContain('@page { size: A4;');
    expect(html).toContain('.qtn-pricing thead { display: table-header-group; }');
  });

  it('keeps fixed-height layout image columns stretched in rendered previews', () => {
    const html = renderer.render(compiled());

    expect(html).toContain(
      '.qtn-block--document [data-layout-block][data-layout-min-height] > [data-layout-column] > p:has(> span[data-image-frame="true"]) > span[data-image-frame="true"] > img {',
    );
    expect(html).toContain(
      '.qtn-block--document [data-layout-block] > [data-layout-column] > p > span:has(> span[data-image-frame="true"]) > span[data-image-frame="true"] {',
    );
    expect(html).toContain('height: 100% !important;');
  });

  it('falls back to the brand colour when the template kept the schema default', () => {
    const html = renderer.render(compiled());
    expect(html).toContain('--qtn-accent: #0f6a63');
  });

  it("lets a template's own accent win over the brand colour", () => {
    const html = renderer.render(
      compiled({
        style: { ...compiled().style, accentColor: '#b4271b' },
      }),
    );
    expect(html).toContain('--qtn-accent: #b4271b');
  });

  it('refuses a colour that is not a plain hex literal', () => {
    const html = renderer.render(
      compiled({
        style: { ...compiled().style, accentColor: 'red; } body { display: none } .x {' },
      }),
    );

    expect(html).toContain('--qtn-accent: #0f6a63');
    expect(html).not.toContain('display: none');
  });

  it('ignores an unknown font rather than writing it into CSS', () => {
    const html = renderer.render(
      compiled({
        style: { ...compiled().style, fontFamily: 'Comic Sans"; behavior: url(x)' },
      }),
    );

    expect(html).not.toContain('behavior');
    expect(html).toContain("font-family: 'Inter'");
  });

  it('escapes company and customer text', () => {
    const base = compiled();
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
      compiled({ style: { ...compiled().style, pageSize: 'LETTER' } }),
    );
    expect(html).toContain('@page { size: Letter;');
  });

  it('renderPage wraps the document as a standalone HTML file', () => {
    const html = renderer.renderPage(compiled());

    expect(html.startsWith('<!doctype html>')).toBe(true);
    expect(html).toContain('<title>14 days tour package</title>');
    expect(html).toContain('class="qtn-document"');
  });

  it('renders a revision whose dates came back from JSON as strings', () => {
    const base = compiled();
    const html = renderer.render({
      ...base,
      meta: {
        ...base.meta,
        documentDate: '2026-08-10T00:00:00.000Z' as unknown as Date,
        validUntil: '2026-08-25T00:00:00.000Z' as unknown as Date,
      },
    });

    expect(html).toContain('10 Aug 2026');
  });

  describe('page structure', () => {
    it('marks only the block asked to start a new page', () => {
      const base = compiled();
      const html = renderer.render({
        ...base,
        blocks: [
          { ...base.blocks[0], id: 'intro', newPage: false },
          { ...base.blocks[1], id: 'pricing', newPage: true },
        ],
      });

      expect(/id="intro"[^>]*data-new-page/.test(html)).toBe(false);
      expect(/id="pricing"[^>]*data-new-page="true"/.test(html)).toBe(true);
    });

    it('renders the pricing block label above the table', () => {
      const base = compiled();
      const html = renderer.render({
        ...base,
        blocks: [
          base.blocks[0],
          { ...base.blocks[1], label: 'Commercials' },
        ],
      });

      expect(html).toContain('<h2>Commercials</h2>');
    });

    it('renders a compact quotation header when pricing starts on a fresh page', () => {
      const base = compiled();
      const html = renderer.render({
        ...base,
        blocks: [
          { ...base.blocks[0], id: 'intro', newPage: false },
          { ...base.blocks[1], id: 'pricing', label: 'Items', newPage: true },
        ],
      });

      expect(html).toContain('qtn-commercial-header');
      expect(html).toContain('Commercials');
      expect(html).toContain('<h2>Items</h2>');
      expect(html).toContain('Q-2026-00002');
    });

    it('breaks before it on paper and shows a marker on screen', () => {
      const html = renderer.render(compiled());

      expect(html).toContain('break-before: page');
      expect(html).toContain('content: "New page"');
      // The manual page-break block keeps working alongside it.
      expect(html).toContain('break-after: page');
    });

    it('leaves a revision compiled before this feature alone', () => {
      // `newPage` is absent entirely, as an older resolvedDocumentJson has it.
      const html = renderer.render(compiled());

      expect(/id="b1"[^>]*data-new-page/.test(html)).toBe(false);
      expect(/id="b2"[^>]*data-new-page/.test(html)).toBe(false);
    });

    it('renders generic field blocks as labelled value cards', () => {
      const base = compiled();
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
      const base = compiled();
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
    it('keeps the authored body clean and moves quotation chrome and closing to the pricing page', () => {
      const html = renderer.render(
        compiled({ body: '<h1>Proposal</h1><p>Our scope of work.</p>' }),
      );

      expect(html).toContain('<h1>Proposal</h1>');
      expect(html).toContain('Our scope of work.');
      // The blocks in the fixture would otherwise print this heading.
      expect(html).not.toContain('Your Kerala itinerary');
      // The fresh pricing page carries the quotation/company/customer chrome.
      expect(html).toContain('Atlas Journeys');
      expect(html).toContain('Prepared for');
      expect(html).toContain('Q-2026-00002');
      expect(html).toContain('Airport pickup included.');
      expect(html).toContain('50% advance, balance before arrival.');
      expect(html).toContain('Cancellation within 7 days is non-refundable.');
      expect(html).not.toContain('<footer class="qtn-footer">');
      // Real quotation items still follow on a fresh page when the body itself
      // did not place the item table.
      expect(html).toContain('Houseboat, 1 night');
      expect(html).toContain('<table class="qtn-pricing">');
      expect(html).toContain(
        'class="qtn-block qtn-block--pricingTable" data-new-page="true"><header class="qtn-letterhead">',
      );
    });

    it('expands the item table into the same priced table a block would show', () => {
      const html = renderer.render(
        compiled({ body: '<p>Prices</p><div data-item-table="true"></div>' }),
      );

      expect(html).toContain('Houseboat, 1 night');
      expect(html).toContain('₹24,000.00');
      expect(html).toContain('<th>Item</th>');
      expect(html).not.toContain('data-item-table');
      expect((html.match(/<table class="qtn-pricing">/g) ?? []).length).toBe(1);
      expect(html).not.toContain('<header class="qtn-letterhead">');
      expect(html).not.toContain('<section class="qtn-parties">');
    });

    it('keeps the closing under an inline item table inside the authored body flow', () => {
      const html = renderer.render(
        compiled({ body: '<p>Prices</p><div data-item-table="true"></div>' }),
      );

      expect(html).toContain('Airport pickup included.');
      expect(html).toContain('50% advance, balance before arrival.');
      expect(html).toContain('Cancellation within 7 days is non-refundable.');
      expect((html.match(/<section class="qtn-closing">/g) ?? []).length).toBe(1);
    });

    it('prints only the columns the author chose', () => {
      const html = renderer.render(
        compiled({
          body: '<div data-item-table="true" data-columns="name,amount"></div>',
        }),
      );

      expect(html).toContain('<th>Item</th>');
      expect(html).toContain('<th class="qtn-cell-numeric">Amount</th>');
      expect(html).not.toContain('>Qty<');
      expect(html).not.toContain('>Rate<');
      // The label column spans everything but the amount.
      expect(html).toContain('<th colspan="1">Subtotal</th>');
    });

    it('folds the unit into the quantity only when unit is not its own column', () => {
      const withUnit = renderer.render(
        compiled({ body: '<div data-item-table="true" data-columns="name,quantity,unit"></div>' }),
      );
      const without = renderer.render(
        compiled({ body: '<div data-item-table="true" data-columns="name,quantity"></div>' }),
      );

      expect(withUnit).toContain('<th>Unit</th>');
      expect(withUnit).toContain('<td class="qtn-cell-numeric">2</td>');
      expect(without).toContain('<td class="qtn-cell-numeric">2 night</td>');
    });

    it('leaves out the totals when the author asked for a bare list', () => {
      const html = renderer.render(
        compiled({ body: '<div data-item-table="true" data-show-totals="false"></div>' }),
      );

      expect(html).toContain('Houseboat, 1 night');
      expect(html).not.toContain('Subtotal');
      // `qtn-total` still appears in the stylesheet, so the table itself is what
      // gets checked: no footer means no totals.
      expect(html).not.toContain('<tfoot>');
    });

    it('ignores a column name it does not know rather than printing a blank one', () => {
      const html = renderer.render(
        compiled({ body: '<div data-item-table="true" data-columns="name,nonsense,amount"></div>' }),
      );

      expect(html).toContain(
        '<thead><tr><th>Item</th><th class="qtn-cell-numeric">Amount</th></tr></thead>',
      );
    });

    it('does not append pricing when the quotation has no priced lines', () => {
      const html = renderer.render(
        compiled({
          body: '<h1>Proposal</h1><p>Our scope of work.</p>',
          pricing: {
            ...compiled().pricing,
            sections: [],
            totals: emptyTotals(),
          },
        }),
      );

      expect(html).not.toContain('<table class="qtn-pricing">');
      expect(html).not.toContain(
        'class="qtn-block qtn-block--pricingTable" data-new-page="true"',
      );
    });
  });
});
