import sanitizeHtml from 'sanitize-html';

/**
 * The free-form document body: sanitising it, and filling in its dynamic values.
 *
 * A document-authored template stores the body as HTML produced by the editor.
 * That HTML is user input, so it is sanitised here before it ever reaches a
 * customer — the editor's own schema is a convenience, not a security boundary,
 * because anyone can POST whatever they like to the endpoint.
 */

/**
 * Everything a quotation document legitimately needs, and nothing that executes.
 *
 * Wider than the block renderer's allowlist because a document carries its own
 * tables and headings rather than receiving them as structured blocks.
 */
const DOCUMENT_SANITIZE: sanitizeHtml.IOptions = {
  allowedTags: [
    'p', 'br', 'hr', 'div', 'span',
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'strong', 'b', 'em', 'i', 'u', 's', 'strike', 'sub', 'sup',
    'ul', 'ol', 'li', 'blockquote',
    'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'colgroup', 'col',
    'a', 'img', 'figure', 'figcaption',
  ],
  allowedAttributes: {
    a: ['href', 'title', 'target', 'rel', 'style'],
    img: ['src', 'alt', 'width', 'height', 'style', 'data-align', 'data-fit'],
    td: ['colspan', 'rowspan', 'style'],
    th: ['colspan', 'rowspan', 'style'],
    col: ['style', 'width'],
    // The editor marks dynamic values and the item table with data attributes;
    // they are read during substitution and never rendered as-is.
    span: [
      'data-dynamic-field',
      'data-label',
      'data-field-type',
      'data-image-frame',
      'data-image-mode',
      'data-image-ratio',
      'data-image-sized',
      'data-image-width',
      'data-image-height',
      'data-image-width-percent',
      'data-image-position-x',
      'data-image-position-y',
      'data-align',
      'data-fit',
      'style'
    ],
    div: [
      // data-item-table / data-columns / data-show-totals were here until the
      // proposal/quotation split. Dropping the expander only stopped the marker
      // being honoured; dropping it from the allowlist stops it being stored,
      // and this sanitiser runs on the way in precisely because the endpoint is
      // reachable without the editor.
      'data-page-break',
      'data-layout-block',
      'data-layout-columns',
      'data-layout-widths',
      'data-layout-background',
      'data-layout-border',
      'data-layout-padding',
      'data-layout-width',
      'data-layout-width-value',
      'data-layout-min-height',
      'data-layout-align',
      'data-layout-column',
      'data-layout-column-background',
      'data-layout-valign',
      'style',
    ],
    // `data-keep-together` is the author's "do not split this across a page".
    // It must survive sanitising or the PDF silently ignores a choice the
    // editor is visibly honouring — the stylesheet turns it into break-inside.
    p: ['style', 'data-keep-together'],
    h1: ['style', 'data-keep-together'],
    h2: ['style', 'data-keep-together'],
    h3: ['style', 'data-keep-together'],
    h4: ['style', 'data-keep-together'],
    h5: ['style', 'data-keep-together'],
    h6: ['style', 'data-keep-together'],
    ul: ['style', 'data-keep-together'],
    ol: ['style', 'data-keep-together'],
    li: ['style'],
    blockquote: ['style', 'data-keep-together'],
    table: ['style', 'data-keep-together'],
    thead: ['style'],
    tbody: ['style'],
    tfoot: ['style'],
    tr: ['style'],
  },
  allowedSchemes: ['http', 'https', 'mailto', 'tel'],
  // Inline images from the editor arrive as data URIs; anything else is dropped.
  allowedSchemesByTag: { img: ['http', 'https', 'data'] },
  allowedStyles: {
    '*': {
      'text-align': [/^left$|^right$|^center$|^justify$/],
      width: [/^auto$|^0$|^\d+(\.\d+)?(px|%|mm|pt|rem|em)$/i],
      height: [/^auto$|^0$|^\d+(\.\d+)?(px|%|mm|pt|rem|em)$/i],
      'min-height': [/^auto$|^0$|^\d+(\.\d+)?(px|%|mm|pt|rem|em)$/i],
      'font-family': [/^[a-z0-9\s"',.-]+$/i],
      'font-size': [/^0$|^\d+(\.\d+)?(px|pt|rem|em|%)$/i],
      'font-weight': [/^(normal|bold|bolder|lighter|[1-9]00)$/i],
      'font-style': [/^(normal|italic|oblique)$/i],
      color: [/^(#[0-9a-f]{3,8}|rgb(a)?\([\d\s.,%]+\)|hsl(a)?\([\d\s.,%]+\)|transparent)$/i],
      'background-color': [/^(#[0-9a-f]{3,8}|rgb(a)?\([\d\s.,%]+\)|hsl(a)?\([\d\s.,%]+\)|transparent)$/i],
      'text-decoration': [/^[a-z0-9\s(),.#%-]+$/i],
      'line-height': [/^(normal|\d+(\.\d+)?|\d+(\.\d+)?(px|pt|rem|em|%))$/i],
      margin: [/^0$|^[\d.\s(pxremt%-]+$/i],
      'margin-top': [/^0$|^\d+(\.\d+)?(px|pt|rem|em|%)$/i],
      'margin-right': [/^0$|^\d+(\.\d+)?(px|pt|rem|em|%)$/i],
      'margin-bottom': [/^0$|^\d+(\.\d+)?(px|pt|rem|em|%)$/i],
      'margin-left': [/^0$|^\d+(\.\d+)?(px|pt|rem|em|%)$/i],
      padding: [/^0$|^[\d.\s(pxremt%-]+$/i],
      'padding-top': [/^0$|^\d+(\.\d+)?(px|pt|rem|em|%)$/i],
      'padding-right': [/^0$|^\d+(\.\d+)?(px|pt|rem|em|%)$/i],
      'padding-bottom': [/^0$|^\d+(\.\d+)?(px|pt|rem|em|%)$/i],
      'padding-left': [/^0$|^\d+(\.\d+)?(px|pt|rem|em|%)$/i],
      'list-style-type': [/^[a-z-]+$/i],
      'list-style-position': [/^(inside|outside)$/i],
      'border-collapse': [/^(collapse|separate)$/i],
      border: [/^[a-z0-9\s(),.#%-]+$/i],
      'border-top': [/^[a-z0-9\s(),.#%-]+$/i],
      'border-right': [/^[a-z0-9\s(),.#%-]+$/i],
      'border-bottom': [/^[a-z0-9\s(),.#%-]+$/i],
      'border-left': [/^[a-z0-9\s(),.#%-]+$/i],
      'vertical-align': [/^(top|middle|bottom|baseline|text-top|text-bottom|sub|super)$/i],
      display: [/^(block|inline-block|flex|grid)$/i],
      gap: [/^0$|^\d+(\.\d+)?(px|pt|rem|em|%)$/i],
      'grid-template-columns': [/^[a-z0-9\s().,%/-]+$/i],
      'aspect-ratio': [/^\d+(\.\d+)?\s*\/\s*\d+(\.\d+)?$/i],
      'max-width': [/^auto$|^0$|^\d+(\.\d+)?(px|%|mm|pt|rem|em)$/i],
      'justify-content': [/^(flex-start|center|flex-end|space-between|space-around|space-evenly)$/i],
      'object-fit': [/^(contain|cover|fill|none|scale-down)$/i],
      '--qtn-image-position-x': [/^\d+(\.\d+)?%$/i],
      '--qtn-image-position-y': [/^\d+(\.\d+)?%$/i],
      overflow: [/^(visible|hidden|clip)$/i],
    },
  },
  disallowedTagsMode: 'discard',
  // An empty paragraph is how an author spaces a document; keep it.
  nonTextTags: ['script', 'style', 'textarea', 'option', 'noscript'],
};

export function sanitiseDocumentBody(html: string): string {
  return sanitizeHtml(html ?? '', DOCUMENT_SANITIZE).trim();
}

/** True when a template is authored as a document rather than as blocks. */
export function hasDocumentBody(html: unknown): boolean {
  return typeof html === 'string' && sanitiseDocumentBody(html).length > 0;
}

/**
 * Why filling happens in two steps, at two different layers.
 *
 * Field values come from the quotation, so the compiler substitutes them and
 * bakes the result into the revision — that is what makes a sent document
 * reproducible. The priced table is markup, so the renderer expands it, exactly
 * as it does for a `pricingTable` block. Splitting them keeps money formatting
 * in one place instead of two.
 */

const FIELD_PATTERN =
  /<span\b[^>]*\bdata-dynamic-field="([^"]*)"[^>]*>[\s\S]*?<\/span>/gi;

/**
 * Substitutes each dynamic field marker with its resolved value.
 *
 * Runs on already-sanitised HTML, so the only elements present are ones the
 * allowlist permitted — which is what makes matching them by pattern safe here.
 * An unknown field key collapses to nothing rather than printing its token: a
 * customer should never receive `{{customer_name}}`.
 */
export function fillDocumentFields(html: string, values: Record<string, string>): string {
  return html.replace(FIELD_PATTERN, (_match, key: string) => {
    const value = values[key];
    if (value === undefined || value === '') return '';
    return renderDynamicFieldValue(_match, value);
  });
}

/** Which dynamic fields a body actually uses — for the fill-in form later. */
export function documentBodyFieldKeys(html: string): string[] {
  const keys = new Set<string>();
  for (const match of html.matchAll(FIELD_PATTERN)) {
    const key = match[1]?.trim();
    if (key) keys.add(key);
  }
  return [...keys];
}

function readAttribute(tag: string, name: string): string | null {
  const match = new RegExp(`${name}="([^"]*)"`, 'i').exec(tag);
  return match ? match[1] : null;
}

function escapeText(input: string): string {
  return sanitizeHtml(input, { allowedTags: [], allowedAttributes: {} });
}

function renderDynamicFieldValue(match: string, value: string): string {
  const safeValue = escapeText(value);
  const preserved = preserveSpanStyle(match);
  return preserved ? `<span ${preserved}>${safeValue}</span>` : safeValue;
}

/** Dynamic markers are spans, so preserving safe wrapper styles is enough here. */
function preserveSpanStyle(match: string): string {
  const style = readAttribute(match, 'style');
  return style ? `style="${escapeAttribute(style)}"` : '';
}

function escapeAttribute(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
