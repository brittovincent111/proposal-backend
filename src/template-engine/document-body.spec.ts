import {
  documentBodyFieldKeys,
  fillDocumentFields,
  hasDocumentBody,
  sanitiseDocumentBody,
} from './document-body';

describe('document body', () => {
  const values = { customer_name: 'Rahul Nair', quote_reference: 'REF-88' };

  describe('sanitising', () => {
    it('keeps the structure a quotation document needs', () => {
      const html = sanitiseDocumentBody(
        '<h1>Quotation</h1><p style="text-align:center">Hello</p><table><tr><td colspan="2">Cell</td></tr></table><ul><li>One</li></ul>',
      );

      expect(html).toContain('<h1>Quotation</h1>');
      expect(html).toContain('text-align:center');
      expect(html).toContain('colspan="2"');
      expect(html).toContain('<li>One</li>');
    });

    it('drops anything that executes', () => {
      const html = sanitiseDocumentBody(
        '<p onclick="steal()">Text</p><script>alert(1)</script><a href="javascript:alert(1)">Link</a><iframe src="x"></iframe>',
      );

      expect(html).not.toContain('onclick');
      expect(html).not.toContain('script');
      expect(html).not.toContain('javascript:');
      expect(html).not.toContain('iframe');
      expect(html).toContain('Text');
    });

    it('allows an embedded image but not a foreign scheme', () => {
      expect(sanitiseDocumentBody('<img src="data:image/png;base64,iVBORw0K" alt="Logo" />')).toContain('data:image/png');
      expect(sanitiseDocumentBody('<img src="file:///etc/passwd" />')).not.toContain('file:');
    });

    it('refuses a style property that is not on the list', () => {
      const html = sanitiseDocumentBody('<p style="position:fixed;text-align:right">x</p>');
      expect(html).not.toContain('position');
      expect(html).toContain('text-align:right');
    });

    it('keeps a manual page break marker for the renderer', () => {
      const html = sanitiseDocumentBody('<p>Page one</p><div data-page-break="true"></div><p>Page two</p>');
      expect(html).toContain('data-page-break="true"');
    });

    it('keeps the author\'s keep-together marker on every block that can carry it', () => {
      // The stylesheet turns this into break-inside: avoid. Strip it here and
      // the PDF silently re-flows a block the editor promised not to split.
      const html = sanitiseDocumentBody(
        '<p data-keep-together="true">Terms</p>' +
          '<h2 data-keep-together="true">Scope</h2>' +
          '<ul data-keep-together="true"><li>One</li></ul>' +
          '<table data-keep-together="true"><tbody><tr><td>Rate</td></tr></tbody></table>' +
          '<blockquote data-keep-together="true">Note</blockquote>',
      );

      expect(html).toContain('<p data-keep-together="true">');
      expect(html).toContain('<h2 data-keep-together="true">');
      expect(html).toContain('<ul data-keep-together="true">');
      expect(html).toContain('<table data-keep-together="true">');
      expect(html).toContain('<blockquote data-keep-together="true">');
    });

    it('keeps layout block attributes and safe grid styling', () => {
      const html = sanitiseDocumentBody(
        '<div data-layout-block="true" data-layout-columns="3" data-layout-widths="33.33,33.33,33.34" style="grid-template-columns:minmax(0,33.33fr) minmax(0,33.33fr) minmax(0,33.34fr)"><div data-layout-column="true" data-layout-valign="middle"><p>One</p></div></div>',
      );

      expect(html).toContain('data-layout-block="true"');
      expect(html).toContain('data-layout-column="true"');
      expect(html).toContain('grid-template-columns:minmax(0,33.33fr)');
      expect(html).toContain('data-layout-valign="middle"');
    });

    it('keeps layout image crop attributes and safe custom properties', () => {
      const html = sanitiseDocumentBody(
        '<span data-image-frame="true" data-image-mode="fill" data-image-position-x="22" data-image-position-y="73" style="max-width:100%;--qtn-image-position-x:22%;--qtn-image-position-y:73%"><img src="https://example.com/photo.jpg" alt="Photo" /></span>',
      );

      expect(html).toContain('data-image-position-x="22"');
      expect(html).toContain('data-image-position-y="73"');
      expect(html).toContain('--qtn-image-position-x:22%');
      expect(html).toContain('--qtn-image-position-y:73%');
    });

    it('recognises an empty body as not being document-authored', () => {
      expect(hasDocumentBody('')).toBe(false);
      expect(hasDocumentBody('<script>alert(1)</script>')).toBe(false);
      expect(hasDocumentBody('<p>Real content</p>')).toBe(true);
      expect(hasDocumentBody(undefined)).toBe(false);
    });
  });

  describe('filling in values', () => {
    const body = sanitiseDocumentBody(
      '<p>Dear <span data-dynamic-field="customer_name" data-label="Customer name">Customer name</span>,</p>' +
        '<p>Total: <span data-dynamic-field="quote_reference" data-label="Reference">Reference</span></p>',
    );

    it('replaces a marker with the resolved value', () => {
      const filled = fillDocumentFields(body, values);

      expect(filled).toContain('Dear Rahul Nair,');
      expect(filled).toContain('REF-88');
      expect(filled).not.toContain('data-dynamic-field');
    });

    it('prints nothing for a field with no value, never the raw token', () => {
      const filled = fillDocumentFields(
        sanitiseDocumentBody('<p>Ref: <span data-dynamic-field="reference">Reference</span></p>'),
        values,
      );

      expect(filled).toBe('<p>Ref: </p>');
      expect(filled).not.toContain('{{');
      expect(filled).not.toContain('Reference');
    });

    it('escapes a value that contains markup', () => {
      const filled = fillDocumentFields(
        sanitiseDocumentBody('<p><span data-dynamic-field="customer_name">Customer name</span></p>'),
        { ...values, customer_name: '<script>alert(1)</script>Acme' },
      );

      expect(filled).not.toContain('<script>');
      expect(filled).toContain('Acme');
    });

    it('keeps safe inline styling around a resolved field value', () => {
      const filled = fillDocumentFields(
        sanitiseDocumentBody(
          '<p><span data-dynamic-field="customer_name" style="color:#e11d48;font-size:12pt">Customer name</span></p>',
        ),
        values,
      );

      expect(filled).toContain('<span style="color:#e11d48;font-size:12pt">Rahul Nair</span>');
    });

    /*
     * The editor stores inline styling as a mark, which serialises as a span
     * wrapping the token rather than as an attribute on it. Substitution must
     * replace only the inner marker and leave that wrapper standing, or the
     * author's font size and colour vanish from the PDF.
     */
    it('keeps the styled wrapper the editor puts around a token', () => {
      const filled = fillDocumentFields(
        sanitiseDocumentBody(
          '<p><span style="font-size:24px;color:rgb(37, 99, 235)">₹' +
            '<span data-dynamic-field="quote_reference" data-label="Reference">Reference</span>' +
            ' / year</span></p>',
        ),
        values,
      );

      expect(filled).toBe(
        '<p><span style="font-size:24px;color:rgb(37, 99, 235)">₹REF-88 / year</span></p>',
      );
    });

    it('keeps two tokens styled differently in one paragraph apart', () => {
      const filled = fillDocumentFields(
        sanitiseDocumentBody(
          '<p><span style="color:#2563eb"><span data-dynamic-field="customer_name">Customer name</span></span>' +
            ' / <span style="color:#dc2626"><span data-dynamic-field="quote_reference">Reference</span></span></p>',
        ),
        values,
      );

      expect(filled).toContain('<span style="color:#2563eb">Rahul Nair</span>');
      expect(filled).toContain('<span style="color:#dc2626">REF-88</span>');
    });

    it('strips an item-table marker rather than storing it', () => {
      // The expander is gone, so the wall has to hold at the sanitiser: the
      // endpoint is reachable without the editor, and a stored marker would
      // otherwise sit in a proposal body waiting for someone to re-add support.
      const sanitised = sanitiseDocumentBody(
        '<div data-item-table="true" data-columns="name,amount" data-show-totals="false">x</div>',
      );

      expect(sanitised).not.toContain('data-item-table');
      expect(sanitised).not.toContain('data-columns');
      expect(sanitised).not.toContain('data-show-totals');
    });
  });

  describe('reading a body', () => {
    it('lists the fields it uses, without duplicates', () => {
      const body = sanitiseDocumentBody(
        '<p><span data-dynamic-field="customer_name">A</span> and <span data-dynamic-field="customer_name">B</span>' +
          ' and <span data-dynamic-field="terms">C</span></p>',
      );

      expect(documentBodyFieldKeys(body).sort()).toEqual(['customer_name', 'terms']);
    });

  });
});
