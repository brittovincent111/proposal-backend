import { Injectable } from '@nestjs/common';
import sanitizeHtml from 'sanitize-html';

import {
  documentBodyUsesItemTable,
  expandItemTables,
} from 'src/template-engine/document-body';
import { CompiledDocument, ResolvedBlock } from 'src/template-engine/document.compiler';
import { formatMinor } from 'src/template-engine/money';
import { DocumentLine, DocumentTotals, LineTotals } from 'src/template-engine/pricing.types';
import { documentStyles, resolveTheme } from './document.styles';

/**
 * One renderer powers the web preview, the public page and the PDF —
 * map.md §35, so the three cannot drift apart.
 *
 * The output carries its own stylesheet (see document.styles.ts) so the same
 * markup looks identical in the builder, in the customer's browser and on paper.
 * `render` returns a fragment for embedding; `renderPage` wraps it as a complete
 * document for the public route and the PDF pipeline.
 *
 * Every string that reaches the output passes through sanitize-html: template
 * content is user input, and §10/§76 forbid executing anything a user supplied.
 */
const SANITIZE: sanitizeHtml.IOptions = {
  allowedTags: [
    'a',
    'b',
    'blockquote',
    'br',
    'col',
    'colgroup',
    'em',
    'h1',
    'h2',
    'h3',
    'h4',
    'h5',
    'h6',
    'i',
    'li',
    'ol',
    'p',
    'span',
    'strong',
    'sub',
    'sup',
    'table',
    'tbody',
    'td',
    'tfoot',
    'th',
    'thead',
    'tr',
    'u',
    'ul',
  ],
  allowedAttributes: {
    a: ['href', 'title'],
    col: ['span', 'width'],
    td: ['colspan', 'rowspan', 'style'],
    th: ['colspan', 'rowspan', 'style'],
    colgroup: ['style'],
    span: ['style'],
    p: ['style'],
    h1: ['style'],
    h2: ['style'],
    h3: ['style'],
    h4: ['style'],
    h5: ['style'],
    h6: ['style'],
    ul: ['style'],
    ol: ['style'],
    li: ['style'],
    blockquote: ['style'],
    table: ['style'],
    thead: ['style'],
    tbody: ['style'],
    tfoot: ['style'],
    tr: ['style'],
  },
  allowedSchemes: ['http', 'https', 'mailto', 'tel'],
  allowedStyles: {
    '*': {
      'background-color': [/^[#(),.%\sa-zA-Z0-9-]+$/],
      border: [/^[#(),.%\sa-zA-Z0-9-]+$/],
      'border-bottom': [/^[#(),.%\sa-zA-Z0-9-]+$/],
      'border-collapse': [/^[a-zA-Z\s-]+$/],
      'border-left': [/^[#(),.%\sa-zA-Z0-9-]+$/],
      'border-right': [/^[#(),.%\sa-zA-Z0-9-]+$/],
      'border-top': [/^[#(),.%\sa-zA-Z0-9-]+$/],
      color: [/^[#(),.%\sa-zA-Z0-9-]+$/],
      'font-size': [/^[#(),.%\sa-zA-Z0-9-]+$/],
      'font-style': [/^[a-zA-Z\s-]+$/],
      'font-weight': [/^[a-zA-Z0-9\s-]+$/],
      height: [/^[#(),.%\sa-zA-Z0-9-]+$/],
      'letter-spacing': [/^[#(),.%\sa-zA-Z0-9-]+$/],
      'line-height': [/^[#(),.%\sa-zA-Z0-9-]+$/],
      margin: [/^[#(),.%\sa-zA-Z0-9-]+$/],
      'margin-bottom': [/^[#(),.%\sa-zA-Z0-9-]+$/],
      'margin-left': [/^[#(),.%\sa-zA-Z0-9-]+$/],
      'margin-right': [/^[#(),.%\sa-zA-Z0-9-]+$/],
      'margin-top': [/^[#(),.%\sa-zA-Z0-9-]+$/],
      padding: [/^[#(),.%\sa-zA-Z0-9-]+$/],
      'padding-bottom': [/^[#(),.%\sa-zA-Z0-9-]+$/],
      'padding-left': [/^[#(),.%\sa-zA-Z0-9-]+$/],
      'padding-right': [/^[#(),.%\sa-zA-Z0-9-]+$/],
      'padding-top': [/^[#(),.%\sa-zA-Z0-9-]+$/],
      'text-align': [/^[a-zA-Z\s-]+$/],
      'text-decoration': [/^[a-zA-Z\s-]+$/],
      'text-indent': [/^[#(),.%\sa-zA-Z0-9-]+$/],
      'vertical-align': [/^[a-zA-Z\s-]+$/],
      'white-space': [/^[a-zA-Z\s-]+$/],
      width: [/^[#(),.%\sa-zA-Z0-9-]+$/],
    },
  },
  // Blocks javascript: and data: URLs outright rather than trying to filter them.
  disallowedTagsMode: 'discard',
};

/**
 * The columns an item table can print, and how each cell is produced.
 *
 * Keyed to match the editor's `ITEM_TABLE_COLUMNS`, so what an author ticks is
 * what prints. Where a column is not shown its content folds into a neighbour —
 * dropping the unit or the description entirely would lose real information.
 */
const PRICING_COLUMNS: Record<
  string,
  {
    label: string;
    numeric?: boolean;
    cell: (context: {
      line: DocumentLine;
      amounts: LineTotals | undefined;
      money: (amount: number) => string;
      optional: boolean;
      cols: string[];
    }) => string;
  }
> = {
  name: {
    label: 'Item',
    cell: ({ line, optional, cols }) => {
      const description =
        line.description && !cols.includes('description')
          ? `<div class="qtn-line-description">${sanitize(line.description)}</div>`
          : '';
      const badge = optional ? '<span class="qtn-badge">Optional</span>' : '';
      return `${sanitize(line.name)}${description}${badge}`;
    },
  },
  description: {
    label: 'Description',
    cell: ({ line }) => sanitize(line.description ?? ''),
  },
  quantity: {
    label: 'Qty',
    numeric: true,
    cell: ({ line, cols }) =>
      cols.includes('unit')
        ? escapeText(String(line.quantity))
        : `${escapeText(String(line.quantity))} ${sanitize(line.unit)}`.trim(),
  },
  unit: { label: 'Unit', cell: ({ line }) => sanitize(line.unit ?? '') },
  rate: { label: 'Rate', numeric: true, cell: ({ line, money }) => money(line.rate) },
  discount: {
    label: 'Discount',
    numeric: true,
    cell: ({ amounts, money }) =>
      amounts?.lineDiscount ? `− ${money(amounts.lineDiscount)}` : '—',
  },
  tax: {
    label: 'Tax',
    numeric: true,
    cell: ({ amounts, money }) => money(amounts?.tax ?? 0),
  },
  amount: {
    label: 'Amount',
    numeric: true,
    cell: ({ amounts, money }) => money(amounts?.total ?? 0),
  },
};

/** What prints when an author has not chosen columns — matches the editor default. */
const DEFAULT_PRICING_COLUMNS = ['name', 'quantity', 'rate', 'amount'];

@Injectable()
export class HtmlRendererService {
  render(document: CompiledDocument): string {
    const theme = resolveTheme(document.style ?? {}, document.meta.company?.accentColor);
    const ownsFullLayout = Boolean(document.body);
    const body = document.body
      ? this.renderDocumentBody(document.body, document)
      : document.blocks
          .map((block) => {
            const width = block.type === 'pageBreak' ? 'full' : block.width ?? 'full';
            return `<div class="qtn-flow-item qtn-width-${width}">${this.renderBlock(block, document)}</div>`;
          })
          .join('\n');

    return `<style>${documentStyles(theme)}</style>
<article class="qtn-document" data-page-size="${escapeAttribute(
      document.style?.pageSize ?? 'A4',
    )}" style="--qtn-accent: ${theme.accent}">
${ownsFullLayout ? '' : this.renderLetterhead(document)}
${ownsFullLayout ? '' : this.renderParties(document)}
<div class="qtn-body">
${body}
</div>
${ownsFullLayout ? '' : this.renderClosing(document)}
${ownsFullLayout ? '' : this.renderFooter(document)}
</article>`;
  }

  /** Standalone page — used by the public proposal route and the PDF renderer. */
  renderPage(document: CompiledDocument): string {
    const title = escapeAttribute(
      document.meta.title || document.meta.documentNumber || 'Quotation',
    );

    return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${title}</title>
<style>
  html { background: #eef0f3; }
  body { margin: 0; padding: 8mm 4mm; }
  @media print { html { background: #fff; } body { padding: 0; } }
</style>
</head>
<body>
${this.render(document)}
</body>
</html>`;
  }

  /* ------------------------------------------------------------- letterhead */

  private renderLetterhead(document: CompiledDocument): string {
    const { company, documentNumber, documentDate, validUntil, reference, locale } = document.meta;
    const showLogo = document.style?.showLogo !== false;
    const logo = showLogo && company.logoUrl ? httpUrl(company.logoUrl) : null;

    const brandMark = logo
      ? `<img class="qtn-logo" src="${escapeAttribute(logo)}" alt="${escapeAttribute(company.name)}" />`
      : `<div class="qtn-monogram">${escapeText(initials(company.name))}</div>`;

    const contact = [company.address, company.phone, company.email, company.website]
      .map((entry) => (entry ?? '').trim())
      .filter(Boolean)
      .join('\n');
    const taxLine = company.taxNumber ? `\nGSTIN / Tax no. ${company.taxNumber}` : '';

    const dates = [
      ['Date', formatDate(documentDate, locale)],
      ['Valid until', formatDate(validUntil, locale)],
      ...(reference ? [['Reference', reference] as const] : []),
    ]
      .filter(([, value]) => Boolean(value))
      .map(([label, value]) => `<dt>${escapeText(label)}</dt><dd>${escapeText(value)}</dd>`)
      .join('');

    const headerNote = document.style?.headerText
      ? `<p class="qtn-headnote">${sanitize(document.style.headerText)}</p>`
      : '';
    const title = document.meta.title
      ? `<h1 class="qtn-title">${escapeText(document.meta.title)}</h1>`
      : '';

    return `<header class="qtn-letterhead">
  <div class="qtn-brand">
    ${brandMark}
    <div>
      <p class="qtn-company">${escapeText(company.name)}</p>
      <p class="qtn-company-meta">${escapeText(contact + taxLine)}</p>
    </div>
  </div>
  <div class="qtn-docmeta">
    <p class="qtn-doctype">Quotation</p>
    <p class="qtn-docnumber">${escapeText(documentNumber)}</p>
    <dl class="qtn-docdates">${dates}</dl>
  </div>
</header>
<div class="qtn-rule"></div>
${headerNote}
${title}`;
  }

  private renderParties(document: CompiledDocument): string {
    const { customer } = document.meta;
    const name = customer.companyName || customer.name;
    if (!name) return '';

    const lines = [
      customer.companyName && customer.name ? customer.name : '',
      customer.billingAddress,
      [customer.email, customer.phone].filter(Boolean).join(' · '),
    ]
      .map((entry) => (entry ?? '').trim())
      .filter(Boolean)
      .join('\n');

    return `<section class="qtn-parties">
  <div class="qtn-party">
    <p class="qtn-party-label">Prepared for</p>
    <p class="qtn-party-name">${escapeText(name)}</p>
    <p class="qtn-party-line">${escapeText(lines)}</p>
  </div>
</section>`;
  }

  /**
   * Notes, payment terms and conditions live on the document rather than in the
   * template body, so they are rendered after the blocks — a quotation that has
   * them must not print without them.
   */
  private renderClosing(document: CompiledDocument): string {
    const notes = [
      { label: 'Notes', body: document.meta.customerNotes, boxed: true },
      {
        label: 'Payment terms',
        body: document.consumed?.paymentTerms ? '' : document.meta.paymentTerms,
        boxed: false,
      },
      // Skipped when a terms block in the body already printed them, so the
      // customer never receives two terms sections.
      {
        label: 'Terms & conditions',
        body: document.consumed?.terms ? '' : document.meta.terms,
        boxed: false,
      },
    ].filter((note) => (note.body ?? '').trim().length > 0);

    if (!notes.length) return '';

    const blocks = notes
      .map(
        (note) => `<div class="qtn-note${note.boxed ? ' qtn-note--boxed' : ''}">
    <h3>${escapeText(note.label)}</h3>
    <div class="qtn-note-body">${sanitize(note.body)}</div>
  </div>`,
      )
      .join('\n  ');

    return `<section class="qtn-closing">
  ${blocks}
</section>`;
  }

  private renderFooter(document: CompiledDocument): string {
    const footerText = document.style?.footerText ?? '';
    const left = footerText
      ? sanitize(footerText)
      : escapeText(`${document.meta.company.name} · ${document.meta.documentNumber}`);

    return `<footer class="qtn-footer">
  <span>${left}</span>
  <span>${escapeText(document.meta.documentNumber)}</span>
</footer>`;
  }

  /* --------------------------------------------------- document-authored body */

  /**
   * Prints a document-authored body in place of the block loop.
   *
   * The HTML arrives sanitised and with its field values already substituted by
   * the compiler, so the only work left is expanding each item-table marker into
   * the real priced table — the same table a `pricingTable` block produces, so
   * the two authoring styles cannot show different money.
   */
  private renderDocumentBody(body: string, document: CompiledDocument): string {
    const bodyOwnsPricing = documentBodyUsesItemTable(body);
    const expanded = expandItemTables(body, (columns, showTotals) =>
      this.renderPricing(document, columns, showTotals),
    );
    const appendix =
      bodyOwnsPricing
        ? this.renderDocumentClosing(document)
        : !this.hasPricingContent(document)
          ? ''
          : this.renderPricingAppendix(document);
    return `<div class="qtn-flow-item qtn-width-full"><section class="qtn-block qtn-block--document qtn-prose">${expanded}</section></div>${appendix}`;
  }

  /**
   * A quotation still needs its commercial table even when the authored layout
   * did not place an inline item-table marker. It prints on a fresh page so the
   * authored narrative remains untouched and the pricing stays easy to scan.
   */
  private renderPricingAppendix(document: CompiledDocument): string {
    return `<div class="qtn-flow-item qtn-width-full"><section class="qtn-block qtn-block--pricingTable" data-new-page="true">${this.renderLetterhead(document)}${this.renderParties(document)}${this.renderPricing(document)}${this.renderClosing(document)}</section></div>`;
  }

  private renderDocumentClosing(document: CompiledDocument): string {
    const closing = this.renderClosing(document);
    return closing ? `<div class="qtn-flow-item qtn-width-full">${closing}</div>` : '';
  }

  private hasPricingContent(document: CompiledDocument): boolean {
    return document.pricing.sections.some((section) => section.lines.length > 0);
  }

  /* ----------------------------------------------------------------- blocks */

  private renderBlock(block: ResolvedBlock, document: CompiledDocument): string {
    const classes = `qtn-block qtn-block--${block.type} qtn-align-${block.align} qtn-spacing-${block.spacing} qtn-emphasis-${block.emphasis}`;
    const open = `<section class="${classes}" id="${escapeAttribute(block.id)}"${
      block.newPage ? ' data-new-page="true"' : ''
    }>`;
    const close = '</section>';

    switch (block.type) {
      case 'divider':
        return `${open}<hr />${close}`;
      case 'spacer':
        return `${open}<div class="qtn-spacer"></div>${close}`;
      case 'pageBreak':
        return `${open}<div class="qtn-page-break"></div>${close}`;
      case 'heading':
        return `${open}<h2>${sanitize(block.content)}</h2>${close}`;
      case 'shortTextField':
      case 'longTextField':
      case 'numberField':
      case 'currencyField':
      case 'dateField':
      case 'dropdownField':
      case 'yesNoField':
        return `${open}${this.renderField(block)}${close}`;
      case 'image':
        return `${open}${this.renderImage(block.content, block.label)}${close}`;
      case 'gallery':
        return `${open}<div class="qtn-gallery">${block.items
          .map((item) => this.renderImage(item, ''))
          .join('')}</div>${close}`;
      case 'pricingTable':
        return `${open}${this.renderPricingSection(block, document)}${close}`;
      case 'table':
        return `${open}${this.renderKeyValueTable(block)}${close}`;
      case 'repeatingList':
      case 'terms':
      case 'payment':
        return `${open}${this.renderList(block)}${close}`;
      default:
        return `${open}${this.renderProse(block)}${close}`;
    }
  }

  private renderProse(block: ResolvedBlock): string {
    const heading = block.label ? `<h3>${sanitize(block.label)}</h3>` : '';
    const content = block.content ? `<div class="qtn-prose">${sanitize(block.content)}</div>` : '';
    const items = block.items.length ? this.renderList(block) : '';
    return `${heading}${content}${items}`;
  }

  private renderField(block: ResolvedBlock): string {
    const label = block.label ? `<p class="qtn-field-label">${sanitize(block.label)}</p>` : '';
    const value = block.content.trim()
      ? sanitize(block.content)
      : '<span class="qtn-field-empty">&mdash;</span>';
    return `<div class="qtn-field">${label}<div class="qtn-field-value">${value}</div></div>`;
  }

  private renderList(block: ResolvedBlock): string {
    const heading = block.label ? `<h3>${sanitize(block.label)}</h3>` : '';
    // No rows means nothing to say — printing the heading alone leaves the
    // customer with an empty "What's included" section.
    if (!block.items.length) return '';
    const rows = block.items.map((item) => `<li>${sanitize(item)}</li>`).join('');
    return `${heading}<ul class="qtn-list">${rows}</ul>`;
  }

  /** Rows are authored as "Label | Value"; anything without a pipe becomes a full-width row. */
  private renderKeyValueTable(block: ResolvedBlock): string {
    const heading = block.label ? `<h3>${sanitize(block.label)}</h3>` : '';
    const rows = block.items
      .map((item) => {
        const [label, ...rest] = item.split('|');
        const value = rest.join('|').trim();
        return value
          ? `<tr><th>${sanitize(label.trim())}</th><td>${sanitize(value)}</td></tr>`
          : `<tr><td colspan="2">${sanitize(label.trim())}</td></tr>`;
      })
      .join('');
    return `${heading}<table class="qtn-table"><tbody>${rows}</tbody></table>`;
  }

  private renderPricingSection(block: ResolvedBlock, document: CompiledDocument): string {
    const heading = sanitize((block.label ?? '').trim() || 'Items & pricing');
    if (block.newPage) {
      return `${this.renderCommercialHeader(document, heading)}${this.renderPricing(document)}`;
    }
    return `<h2>${heading}</h2>${this.renderPricing(document)}`;
  }

  private renderCommercialHeader(document: CompiledDocument, heading: string): string {
    const { company, documentNumber, documentDate, validUntil, reference, locale } = document.meta;
    const showLogo = document.style?.showLogo !== false;
    const logo = showLogo && company.logoUrl ? httpUrl(company.logoUrl) : null;
    const brandMark = logo
      ? `<img class="qtn-logo" src="${escapeAttribute(logo)}" alt="${escapeAttribute(company.name)}" />`
      : `<div class="qtn-monogram">${escapeText(initials(company.name))}</div>`;

    const contact = [company.email, company.phone].map((entry) => (entry ?? '').trim()).filter(Boolean).join(' · ');
    const contactLine = contact ? `<p class="qtn-commercial-line">${escapeText(contact)}</p>` : '';
    const dates = [
      ['Date', formatDate(documentDate, locale)],
      ['Valid until', formatDate(validUntil, locale)],
      ...(reference ? [['Reference', reference] as const] : []),
    ]
      .filter(([, value]) => Boolean(value))
      .map(([label, value]) => `<dt>${escapeText(label)}</dt><dd>${escapeText(value)}</dd>`)
      .join('');

    return `<div class="qtn-commercial-header">
  <div class="qtn-commercial-top">
    <div class="qtn-commercial-brand">
      ${brandMark}
      <div>
        <p class="qtn-commercial-company">${escapeText(company.name)}</p>
        ${contactLine}
      </div>
    </div>
    <div class="qtn-commercial-meta">
      <p class="qtn-doctype">Quotation</p>
      <p class="qtn-docnumber">${escapeText(documentNumber)}</p>
      <dl class="qtn-docdates">${dates}</dl>
    </div>
  </div>
  <div class="qtn-rule"></div>
  <div class="qtn-commercial-heading">
    <p class="qtn-commercial-kicker">Commercials</p>
    <h2>${heading}</h2>
  </div>
</div>`;
  }

  private renderPricing(
    document: CompiledDocument,
    columns: string[] = DEFAULT_PRICING_COLUMNS,
    showTotals = true,
  ): string {
    const { sections, totals, currency, locale, taxInclusive } = document.pricing;
    const money = (amount: number) => escapeText(formatMinor(amount, currency, locale));

    // An unknown column name is dropped rather than printed as an empty column,
    // and an empty request falls back to the four columns every quotation needs.
    const chosen = columns.filter((key) => key in PRICING_COLUMNS);
    const cols = chosen.length ? chosen : DEFAULT_PRICING_COLUMNS;
    const span = cols.length;

    const sectionHtml = sections
      .map((section) => {
        const rows = section.lines
          .map((line) => this.renderPricingRow(line, totals, money, cols))
          .join('');
        const title = section.title
          ? `<tr class="qtn-section"><td colspan="${span}">${sanitize(section.title)}</td></tr>`
          : '';
        return `${title}${rows}`;
      })
      .join('');

    const head = `<thead><tr>${cols
      .map((key) => {
        const column = PRICING_COLUMNS[key];
        return `<th${column.numeric ? ' class="qtn-cell-numeric"' : ''}>${escapeText(
          column.label,
        )}</th>`;
      })
      .join('')}</tr></thead>`;

    if (!showTotals) {
      return `<table class="qtn-pricing">
  ${head}
  <tbody>${sectionHtml}</tbody>
</table>`;
    }

    // The label spans every column but the last, which holds the amount.
    const labelSpan = Math.max(1, span - 1);
    const summaryRow = (label: string, value: string) =>
      `<tr><th colspan="${labelSpan}">${label}</th><td>${value}</td></tr>`;

    const summary: string[] = [summaryRow('Subtotal', money(totals.subtotal))];
    if (totals.discountTotal > 0) {
      summary.push(summaryRow('Discount', `− ${money(totals.discountTotal)}`));
    }
    totals.taxSummary.forEach((tax) => {
      summary.push(summaryRow(`${escapeText(tax.name)} (${tax.percent}%)`, money(tax.tax)));
    });
    if (totals.chargesTotal > 0) {
      summary.push(summaryRow('Other charges', money(totals.chargesTotal)));
    }
    if (totals.roundOffAdjustment !== 0) {
      summary.push(summaryRow('Round off', money(totals.roundOffAdjustment)));
    }
    summary.push(
      `<tr class="qtn-total"><th colspan="${labelSpan}">Total${
        taxInclusive ? ' (tax inclusive)' : ''
      }</th><td>${money(totals.grandTotal)}</td></tr>`,
    );
    if (totals.optionalTotal > 0) {
      summary.push(
        `<tr class="qtn-optional"><th colspan="${labelSpan}">Optional add-ons (not included above)</th><td>${money(
          totals.optionalTotal,
        )}</td></tr>`,
      );
    }

    return `<table class="qtn-pricing">
  ${head}
  <tbody>${sectionHtml}</tbody>
  <tfoot>${summary.join('')}</tfoot>
</table>`;
  }

  private renderPricingRow(
    line: DocumentLine,
    totals: DocumentTotals,
    money: (amount: number) => string,
    cols: string[],
  ): string {
    const span = cols.length;
    if (line.kind === 'HEADING') {
      return `<tr class="qtn-line-heading"><td colspan="${span}">${sanitize(line.name)}</td></tr>`;
    }
    if (line.kind === 'NOTE') {
      return `<tr class="qtn-line-note"><td colspan="${span}">${sanitize(
        line.description || line.name,
      )}</td></tr>`;
    }

    const amounts = totals.lines[line.id];
    const optional = line.optional && !line.selected;
    const cells = cols
      .map((key) => {
        const column = PRICING_COLUMNS[key];
        return `<td${column.numeric ? ' class="qtn-cell-numeric"' : ''}>${column.cell({
          line,
          amounts,
          money,
          optional,
          cols,
        })}</td>`;
      })
      .join('');

    return `<tr class="qtn-line${optional ? ' qtn-line--optional' : ''}">${cells}</tr>`;
  }

  /** Only http(s) image sources survive; anything else renders as a caption. */
  private renderImage(source: string, alt: string): string {
    const url = httpUrl(source);
    if (!url) {
      return `<div class="qtn-image-placeholder">${sanitize(source)}</div>`;
    }
    return `<img src="${escapeAttribute(url)}" alt="${escapeAttribute(alt)}" loading="lazy" />`;
  }
}

function httpUrl(source: string): string | null {
  return /^https?:\/\//i.test(source ?? '') ? source : null;
}

/** Falls back to a monogram when a company has no logo uploaded. */
function initials(name: string): string {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return 'Q';
  return parts
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join('');
}

/** Dates survive JSON round-trips as strings, so both shapes reach the renderer. */
function formatDate(value: Date | string | null | undefined, locale: string): string {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  try {
    return new Intl.DateTimeFormat(locale || 'en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    }).format(date);
  } catch {
    return date.toISOString().slice(0, 10);
  }
}

function sanitize(input: string): string {
  return sanitizeHtml(input ?? '', SANITIZE);
}

function escapeText(input: string): string {
  return sanitizeHtml(input ?? '', { allowedTags: [], allowedAttributes: {} });
}

function escapeAttribute(input: string): string {
  return (input ?? '').replace(/[<>"'&]/g, (character) => {
    switch (character) {
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '"':
        return '&quot;';
      case "'":
        return '&#39;';
      default:
        return '&amp;';
    }
  });
}
