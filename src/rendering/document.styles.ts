/**
 * The document stylesheet, shipped inside the rendered HTML.
 *
 * It travels with the markup on purpose: the web preview, the public proposal
 * page (an iframe) and the print/PDF path all get identical output, and none of
 * them has to carry a copy of these rules. Every selector is scoped under
 * `.qtn-document` so injecting the fragment into the app cannot leak styling.
 *
 * Nothing user-supplied is interpolated into CSS. The two theme inputs arrive as
 * a validated hex colour (as a custom property on the root element) and a font
 * stack chosen from a fixed list — see `resolveTheme`.
 */

const FONT_STACKS: Record<string, string> = {
  inter: "'Inter', 'Helvetica Neue', Arial, sans-serif",
  roboto: "'Roboto', 'Helvetica Neue', Arial, sans-serif",
  lato: "'Lato', 'Helvetica Neue', Arial, sans-serif",
  'open sans': "'Open Sans', 'Helvetica Neue', Arial, sans-serif",
  'ibm plex sans': "'IBM Plex Sans', 'Helvetica Neue', Arial, sans-serif",
  'source sans 3': "'Source Sans 3', 'Source Sans Pro', Arial, sans-serif",
  georgia: "Georgia, 'Times New Roman', serif",
  merriweather: "'Merriweather', Georgia, serif",
  'playfair display': "'Playfair Display', Georgia, serif",
  system: "system-ui, -apple-system, 'Segoe UI', Arial, sans-serif",
};

const DEFAULT_FONT = FONT_STACKS.inter;

/** Mirrors `styleSchemaJson.accentColor`'s default — kept in sync deliberately. */
const DEFAULT_ACCENT = '#2563eb';

function isHexColor(value: string): boolean {
  return /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(value);
}

export interface DocumentTheme {
  accent: string;
  fontStack: string;
  pageSize: 'A4' | 'Letter';
}

/**
 * Reduces the free-text style schema to values that are safe to place in CSS:
 * an unrecognised font or a colour that is not a plain hex literal falls back to
 * the default rather than reaching the stylesheet.
 */
export function resolveTheme(
  style: {
    accentColor?: string;
    fontFamily?: string;
    pageSize?: string;
  },
  /**
   * The organisation's brand colour, used when the template never chose one of
   * its own. A template still overrides it — the pinned template owns the
   * document's look — but the schema default must not silently repaint every
   * document blue for an organisation whose branding says otherwise.
   */
  brandAccent?: string,
): DocumentTheme {
  const chosen = (style.accentColor ?? '').trim();
  const templateAccent = isHexColor(chosen) && chosen.toLowerCase() !== DEFAULT_ACCENT ? chosen : '';
  const fallback = isHexColor((brandAccent ?? '').trim()) ? brandAccent!.trim() : DEFAULT_ACCENT;
  const accent = templateAccent || fallback;

  const fontStack = FONT_STACKS[(style.fontFamily ?? '').trim().toLowerCase()] ?? DEFAULT_FONT;

  return {
    accent,
    fontStack,
    pageSize: style.pageSize === 'LETTER' ? 'Letter' : 'A4',
  };
}

/**
 * `pageSize` is an enum and `fontStack` comes from the table above, so both are
 * safe to interpolate. The accent arrives as a custom property on the element.
 */
export function documentStyles(theme: DocumentTheme): string {
  return `
.qtn-document {
  --qtn-ink: #16181d;
  --qtn-ink-muted: #5c6672;
  --qtn-ink-subtle: #8b939d;
  --qtn-line: #e3e7ec;
  --qtn-line-strong: #cfd5dd;
  --qtn-subtle: #f6f8fa;
  --qtn-radius: 8px;
  box-sizing: border-box;
  width: 100%;
  max-width: 210mm;
  margin: 0 auto;
  background: #fff;
  padding: 16mm 15mm;
  color: var(--qtn-ink);
  font-family: ${theme.fontStack};
  font-size: 10.5pt;
  line-height: 1.55;
  -webkit-font-smoothing: antialiased;
  text-rendering: optimizeLegibility;
}
.qtn-document[data-page-size="LETTER"] { max-width: 215.9mm; }
.qtn-document *, .qtn-document *::before, .qtn-document *::after { box-sizing: inherit; }
.qtn-document p, .qtn-document h1, .qtn-document h2, .qtn-document h3, .qtn-document dl,
.qtn-document dd, .qtn-document dt, .qtn-document ul, .qtn-document ol, .qtn-document figure {
  margin: 0;
  padding: 0;
}
.qtn-document ul, .qtn-document ol { list-style: none; }
.qtn-document a { color: inherit; text-decoration: none; }
.qtn-document img { max-width: 100%; height: auto; display: block; }

/* --- authored layout blocks ------------------------------------------------ */

.qtn-block--document [data-layout-block] {
  display: grid;
  gap: 3mm;
  width: 100%;
  margin: 4mm 0;
  min-height: 0;
  height: auto;
}

.qtn-block--document [data-layout-block][data-layout-min-height] {
  overflow: hidden;
}

.qtn-block--document [data-layout-block][data-layout-width="wide"] { max-width: 75%; }
.qtn-block--document [data-layout-block][data-layout-width="half"] { max-width: 50%; }
.qtn-block--document [data-layout-block][data-layout-align="center"] {
  margin-left: auto;
  margin-right: auto;
}
.qtn-block--document [data-layout-block][data-layout-align="right"] { margin-left: auto; }
.qtn-block--document [data-layout-block][data-layout-background="subtle"] { background: var(--qtn-subtle); }
.qtn-block--document [data-layout-block][data-layout-border="outer"] {
  border: 1px solid var(--qtn-line-strong);
  border-radius: var(--qtn-radius);
}

.qtn-block--document [data-layout-block] > [data-layout-column] {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2mm;
  justify-content: flex-start;
}

.qtn-block--document [data-layout-block][data-layout-min-height] > [data-layout-column] {
  overflow: hidden;
  min-height: 0;
  height: 100%;
}

.qtn-block--document [data-layout-block] > [data-layout-column] > p {
  width: 100%;
  min-width: 0;
}

.qtn-block--document [data-layout-block] > [data-layout-column]:has(> p > span[data-image-frame="true"]) {
  padding: 0 !important;
  gap: 0;
  overflow: hidden;
}

.qtn-block--document [data-layout-block] > [data-layout-column] p:has(> span[data-image-frame="true"]:only-child) {
  display: flex;
  align-items: flex-start;
  width: 100%;
  line-height: 0;
  margin: 0;
}

.qtn-block--document [data-layout-block] > [data-layout-column] > p:has(> span[data-image-frame="true"]) {
  display: flex;
  align-items: stretch;
  width: 100%;
  line-height: 0;
  margin: 0;
}

.qtn-block--document [data-layout-block] > [data-layout-column]:has(> p:has(> span[data-image-frame="true"]:only-child):only-child) {
  padding: 0 !important;
}

.qtn-block--document [data-layout-block] > [data-layout-column] p:has(> span[data-image-frame="true"]:only-child):only-child {
  flex: 1 1 auto;
  align-items: stretch;
  min-height: 0;
  height: 100%;
}

.qtn-block--document [data-layout-block] > [data-layout-column] span[data-image-frame="true"][data-image-width-percent="100"] {
  display: block;
  width: 100%;
  min-width: 0;
}

.qtn-block--document [data-layout-block] > [data-layout-column] > p:has(> span[data-image-frame="true"]) > span[data-image-frame="true"] {
  display: flex;
  width: 100%;
  height: 100%;
  flex: 1 1 auto;
  align-self: stretch;
  margin: 0;
}

.qtn-block--document [data-layout-block] > [data-layout-column] p:has(> span[data-image-frame="true"]:only-child) > span[data-image-frame="true"] {
  display: flex;
  width: 100%;
  height: 100%;
  margin: 0;
}

.qtn-block--document [data-layout-block] > [data-layout-column] > p:has(> span[data-image-frame="true"]) > span[data-image-frame="true"][data-image-mode="fit"],
.qtn-block--document [data-layout-block] > [data-layout-column] > p:has(> span[data-image-frame="true"]) > span[data-image-frame="true"][data-image-mode="fill"] {
  width: 100% !important;
  height: 100%;
}

.qtn-block--document [data-layout-block] > [data-layout-column] p:has(> span[data-image-frame="true"]:only-child) > span[data-image-frame="true"][data-image-mode="fit"],
.qtn-block--document [data-layout-block] > [data-layout-column] p:has(> span[data-image-frame="true"]:only-child) > span[data-image-frame="true"][data-image-mode="fill"] {
  width: 100% !important;
  height: 100%;
}

/*
 * Saved inline images can arrive wrapped in a neutral span. Treat that wrapper
 * like the live editor's image container so preview, public page and print keep
 * the same equal-height layout-column behaviour.
 */
.qtn-block--document [data-layout-block] > [data-layout-column]:has(> p > span > span[data-image-frame="true"]) {
  padding: 0 !important;
  gap: 0;
  overflow: hidden;
}

.qtn-block--document [data-layout-block] > [data-layout-column] > p:has(> span > span[data-image-frame="true"]) {
  display: flex;
  align-items: stretch;
  width: 100%;
  line-height: 0;
  margin: 0;
}

.qtn-block--document [data-layout-block] > [data-layout-column]:has(> p:has(> span:only-child > span[data-image-frame="true"]):only-child) {
  padding: 0 !important;
}

.qtn-block--document [data-layout-block] > [data-layout-column] p:has(> span:only-child > span[data-image-frame="true"]):only-child {
  flex: 1 1 auto;
  align-items: stretch;
  min-height: 0;
  height: 100%;
}

.qtn-block--document [data-layout-block] > [data-layout-column] > p > span:has(> span[data-image-frame="true"]) {
  display: flex;
  width: 100%;
  height: 100%;
  flex: 1 1 auto;
  align-self: stretch;
  min-height: 0;
  margin: 0;
  line-height: 0;
}

.qtn-block--document [data-layout-block][data-layout-min-height] > [data-layout-column] > p > span:has(> span[data-image-frame="true"]) {
  height: 100%;
}

.qtn-block--document [data-layout-block] > [data-layout-column] > p > span:has(> span[data-image-frame="true"]) > span[data-image-frame="true"] {
  display: flex;
  width: 100% !important;
  height: 100% !important;
  flex: 1 1 auto;
  align-self: stretch;
  min-height: 0;
  margin: 0;
}

.qtn-block--document [data-layout-block] > [data-layout-column] > p > span:has(> span[data-image-frame="true"]) > span[data-image-frame="true"][data-image-mode="fit"],
.qtn-block--document [data-layout-block] > [data-layout-column] > p > span:has(> span[data-image-frame="true"]) > span[data-image-frame="true"][data-image-mode="fill"] {
  width: 100% !important;
  height: 100%;
}

/*
 * The live editor's image node view pins layout-column images to the column's
 * measured height. Rendered HTML only has saved markup, so fixed-height layout
 * blocks need an explicit height chain to keep preview and print aligned.
 */
.qtn-block--document [data-layout-block][data-layout-min-height] > [data-layout-column] > p:has(> span[data-image-frame="true"]) {
  flex: 1 1 auto;
  min-height: 0;
  height: 100%;
}

.qtn-block--document [data-layout-block][data-layout-min-height] > [data-layout-column] > p:has(> span[data-image-frame="true"]) > span[data-image-frame="true"] {
  display: flex;
  width: 100% !important;
  flex: 1 1 auto;
  align-self: stretch;
  min-height: 0;
  height: 100% !important;
}

.qtn-block--document [data-layout-block][data-layout-min-height] > [data-layout-column] > p:has(> span[data-image-frame="true"]) > span[data-image-frame="true"] > img {
  width: 100%;
  min-height: 0;
  height: 100% !important;
}

.qtn-block--document [data-layout-block][data-layout-min-height] > [data-layout-column] > p > span:has(> span[data-image-frame="true"]) > span[data-image-frame="true"] > img {
  width: 100%;
  min-height: 0;
  height: 100% !important;
}

.qtn-block--document [data-layout-block][data-layout-border="all"] > [data-layout-column] {
  border: 1px solid var(--qtn-line);
}

.qtn-block--document [data-layout-block][data-layout-padding="compact"] > [data-layout-column] { padding: 1.8mm; }
.qtn-block--document [data-layout-block][data-layout-padding="normal"] > [data-layout-column] { padding: 2.8mm; }
.qtn-block--document [data-layout-block][data-layout-padding="comfortable"] > [data-layout-column] { padding: 4mm; }

.qtn-block--document [data-layout-column][data-layout-column-background="subtle"] { background: var(--qtn-subtle); }
.qtn-block--document [data-layout-column][data-layout-valign="middle"] { justify-content: center; }
.qtn-block--document [data-layout-column][data-layout-valign="bottom"] { justify-content: flex-end; }

.qtn-block--document p > span[data-image-frame="true"] {
  display: inline-flex;
  vertical-align: top;
  margin: 1.5mm 1.5mm 1.5mm 0;
}

.qtn-block--document p:has(> span[data-image-frame="true"]:only-child[data-align="center"]) {
  text-align: center;
}

.qtn-block--document p:has(> span[data-image-frame="true"]:only-child[data-align="right"]) {
  text-align: right;
}

.qtn-block--document p:has(> span[data-image-frame="true"]:only-child) > span[data-image-frame="true"] {
  margin-right: 0;
}

.qtn-block--document span[data-image-frame="true"] {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  max-width: 100%;
  overflow: visible;
  border-radius: calc(var(--qtn-radius) - 2px);
}

.qtn-block--document [data-layout-block] > [data-layout-column] span[data-image-frame="true"] {
  border-radius: 0;
}

.qtn-block--document span[data-image-frame="true"][data-image-mode="fit"],
.qtn-block--document span[data-image-frame="true"][data-image-mode="fill"] {
  overflow: hidden;
}

.qtn-block--document span[data-image-frame="true"] > img {
  display: block;
  max-width: 100%;
  height: auto;
  border-radius: inherit;
  object-position: var(--qtn-image-position-x, 50%) var(--qtn-image-position-y, 50%);
}

.qtn-block--document [data-layout-block] > [data-layout-column] span[data-image-frame="true"] > img {
  border-radius: 0;
}

.qtn-block--document span[data-image-frame="true"][data-image-mode="original"] > img {
  width: auto;
  max-width: 100%;
  height: auto;
  object-fit: contain;
}

.qtn-block--document span[data-image-frame="true"][data-image-mode="original"][data-image-sized="true"] > img {
  width: 100%;
}

.qtn-block--document span[data-image-frame="true"][data-image-mode="fit"] > img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.qtn-block--document [data-layout-block] > [data-layout-column] span[data-image-frame="true"][data-image-mode="fit"] > img {
  object-fit: fill;
}

.qtn-block--document span[data-image-frame="true"][data-image-mode="fill"] > img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.qtn-block--document p > img[data-fit="fill"] {
  display: block;
  width: 100%;
  height: auto;
  margin-right: 0;
  object-fit: cover;
}

.qtn-block--document img[data-fit="contain"] {
  object-fit: contain;
}

/* --- letterhead ------------------------------------------------------------ */

.qtn-letterhead {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12mm;
  padding-bottom: 6mm;
}
.qtn-brand { display: flex; align-items: flex-start; gap: 4mm; min-width: 0; flex: 1 1 60%; }
.qtn-logo { width: auto; max-width: 42mm; max-height: 16mm; }
.qtn-monogram {
  display: grid;
  place-items: center;
  width: 12mm;
  height: 12mm;
  border-radius: var(--qtn-radius);
  background: var(--qtn-accent);
  color: #fff;
  font-size: 13pt;
  font-weight: 700;
  letter-spacing: -0.02em;
}
.qtn-company { font-size: 13pt; font-weight: 650; letter-spacing: -0.015em; }
.qtn-company-meta {
  margin-top: 1mm;
  color: var(--qtn-ink-muted);
  font-size: 8.5pt;
  line-height: 1.5;
  white-space: pre-line;
}
.qtn-docmeta { flex: 0 0 auto; text-align: right; }
.qtn-doctype {
  color: var(--qtn-accent);
  font-size: 8pt;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}
.qtn-docnumber { font-size: 14pt; font-weight: 680; letter-spacing: -0.02em; }
.qtn-docdates {
  display: grid;
  grid-template-columns: auto auto;
  gap: 0.6mm 4mm;
  margin-top: 3mm;
  font-size: 9pt;
}
.qtn-docdates dt { color: var(--qtn-ink-subtle); text-align: left; }
.qtn-docdates dd { font-weight: 550; font-variant-numeric: tabular-nums; }
.qtn-rule { height: 2.2pt; border-radius: 2pt; background: var(--qtn-accent); }

.qtn-headnote {
  margin-top: 5mm;
  color: var(--qtn-ink-muted);
  font-size: 9.5pt;
}
.qtn-title {
  margin-top: 7mm;
  font-size: 17pt;
  font-weight: 660;
  line-height: 1.25;
  letter-spacing: -0.025em;
}

/* --- parties --------------------------------------------------------------- */

.qtn-parties {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(60mm, 1fr));
  gap: 5mm;
  margin-top: 6mm;
}
.qtn-party {
  border: 1px solid var(--qtn-line);
  border-radius: var(--qtn-radius);
  background: var(--qtn-subtle);
  padding: 4mm;
}
.qtn-party-label {
  color: var(--qtn-ink-subtle);
  font-size: 7.5pt;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}
.qtn-party-name { margin-top: 1.5mm; font-size: 11pt; font-weight: 620; }
.qtn-party-line { color: var(--qtn-ink-muted); font-size: 9pt; white-space: pre-line; }

/* --- blocks ---------------------------------------------------------------- */

.qtn-body {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  gap: 0 4mm;
  margin-top: 8mm;
}
.qtn-flow-item {
  flex: 0 0 100%;
  max-width: 100%;
  min-width: 0;
  break-inside: avoid;
}
.qtn-width-half { flex-basis: calc(50% - 2mm); max-width: calc(50% - 2mm); }
.qtn-width-third { flex-basis: calc(33.333% - 2.67mm); max-width: calc(33.333% - 2.67mm); }
.qtn-block { margin-bottom: 6mm; }
.qtn-block:last-child { margin-bottom: 0; }
.qtn-block h2 {
  font-size: 13pt;
  font-weight: 650;
  letter-spacing: -0.02em;
  padding-bottom: 1.5mm;
  border-bottom: 1px solid var(--qtn-line);
}
.qtn-block h3 {
  font-size: 10.5pt;
  font-weight: 650;
  letter-spacing: 0.01em;
  margin-bottom: 2mm;
}
.qtn-prose { color: var(--qtn-ink-muted); }
.qtn-prose h1,
.qtn-prose h2,
.qtn-prose h3,
.qtn-prose h4,
.qtn-prose h5,
.qtn-prose h6 {
  color: var(--qtn-ink);
  font-weight: 650;
  letter-spacing: -0.02em;
}
.qtn-prose h1 {
  font-size: 18pt;
  line-height: 1.22;
}
.qtn-prose h2 {
  font-size: 15pt;
  line-height: 1.25;
}
.qtn-prose h3 {
  font-size: 12.5pt;
  line-height: 1.28;
}
.qtn-prose h4,
.qtn-prose h5,
.qtn-prose h6 {
  font-size: 11pt;
  line-height: 1.3;
}
.qtn-prose p + p { margin-top: 2mm; }
.qtn-prose > :is(p, h1, h2, h3, h4, h5, h6, blockquote, ul, ol, table) + :is(p, h1, h2, h3, h4, h5, h6, blockquote, ul, ol, table) {
  margin-top: 3mm;
}
.qtn-prose ul,
.qtn-prose ol {
  padding-left: 5mm;
}
.qtn-prose ul {
  list-style: disc;
}
.qtn-prose ol {
  list-style: decimal;
}
.qtn-prose ul li,
.qtn-prose ol li {
  margin: 0;
  padding: 0;
}
.qtn-prose ul li + li,
.qtn-prose ol li + li {
  margin-top: 1.2mm;
}
.qtn-prose ul li::before,
.qtn-prose ol li::before {
  content: none;
}
.qtn-prose blockquote {
  padding-left: 4mm;
  border-left: 2pt solid var(--qtn-line-strong);
  color: var(--qtn-ink-muted);
}
.qtn-prose table {
  width: 100%;
  border-collapse: collapse;
  font-size: 9.5pt;
}
.qtn-prose th,
.qtn-prose td {
  padding: 2mm 2.4mm;
  border: 1px solid var(--qtn-line);
  text-align: left;
  vertical-align: top;
}
.qtn-prose th {
  background: #f6f8fa;
  color: var(--qtn-ink);
  font-weight: 650;
}
.qtn-field {
  display: grid;
  gap: 1mm;
  padding: 3.2mm 3.6mm;
  border: 1px solid var(--qtn-line);
  border-radius: var(--qtn-radius);
  background: var(--qtn-subtle);
}
.qtn-field-label {
  color: var(--qtn-ink-subtle);
  font-size: 7.5pt;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.qtn-field-value {
  color: var(--qtn-ink);
  font-size: 10.5pt;
  font-weight: 560;
}
.qtn-field-empty { color: var(--qtn-ink-subtle); }
.qtn-align-center { text-align: center; }
.qtn-align-right { text-align: right; }
.qtn-spacing-compact { margin-bottom: 3mm; }
.qtn-spacing-roomy { margin-bottom: 10mm; }
.qtn-emphasis-strong h2, .qtn-emphasis-strong h3 { color: var(--qtn-accent); }
.qtn-emphasis-muted, .qtn-emphasis-muted h3 { color: var(--qtn-ink-muted); }
.qtn-block hr { height: 1px; border: 0; background: var(--qtn-line); }
/* A document-authored body: arbitrary HTML the author typed, so it reuses the
   prose scale rather than inventing a second one. Body text sits at full ink —
   a whole document read as muted grey when the block version was an excerpt. */
.qtn-block--document { color: var(--qtn-ink); }
.qtn-block--document > :first-child { margin-top: 0; }
.qtn-block--document > :last-child { margin-bottom: 0; }
.qtn-block--document img { max-width: 100%; height: auto; }
.qtn-block--document .qtn-pricing { margin: 4mm 0; }
.qtn-block--document hr { margin: 4mm 0; }

.qtn-spacer { height: 6mm; }

/*
 * A block that starts its own page. On screen it is drawn like a page break, for
 * the same reason: an author must be able to see where page two begins.
 */
.qtn-block[data-new-page="true"] {
  margin-top: 8mm;
  padding-top: 8mm;
  border-top: 1px dashed var(--qtn-line-strong);
}
.qtn-block[data-new-page="true"]::before {
  content: "New page";
  position: absolute;
  margin-top: -10mm;
  background: #fff;
  padding: 0 2mm;
  color: var(--qtn-ink-subtle);
  font-size: 7.5pt;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.qtn-block[data-new-page="true"] { position: relative; }

/*
 * A page break is invisible on paper by definition, so on screen it has to be
 * drawn — otherwise inserting one in the editor appears to do nothing and the
 * author cannot tell where page two starts.
 */
:is(.qtn-page-break, .qtn-block--document [data-page-break="true"]) {
  position: relative;
  margin: 7mm 0;
  border-top: 1px dashed var(--qtn-line-strong);
}
:is(.qtn-page-break, .qtn-block--document [data-page-break="true"])::after {
  content: "Page break";
  position: absolute;
  top: -1.6mm;
  left: 50%;
  transform: translateX(-50%);
  background: #fff;
  padding: 0 2mm;
  color: var(--qtn-ink-subtle);
  font-size: 7.5pt;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.qtn-list { display: grid; gap: 1.5mm; color: var(--qtn-ink-muted); }
.qtn-list li { position: relative; padding-left: 5mm; }
.qtn-list li::before {
  content: "";
  position: absolute;
  left: 0.8mm;
  top: 1.55mm;
  width: 1.6mm;
  height: 1.6mm;
  border-radius: 50%;
  background: var(--qtn-accent);
}
.qtn-block--repeatingList .qtn-list li::before { box-shadow: none; }

.qtn-image-placeholder {
  border: 1px dashed var(--qtn-line-strong);
  border-radius: var(--qtn-radius);
  padding: 6mm;
  color: var(--qtn-ink-subtle);
  font-size: 9pt;
  text-align: center;
}
.qtn-gallery { display: grid; grid-template-columns: repeat(auto-fit, minmax(45mm, 1fr)); gap: 3mm; }
.qtn-gallery img, .qtn-block--image img { border-radius: var(--qtn-radius); }

/* --- tables ---------------------------------------------------------------- */

.qtn-table, .qtn-pricing {
  width: 100%;
  border-collapse: collapse;
  font-size: 9.5pt;
}
.qtn-table th, .qtn-table td {
  border-bottom: 1px solid var(--qtn-line);
  padding: 2mm 2.5mm;
  text-align: left;
  vertical-align: top;
}
.qtn-table th { width: 38%; color: var(--qtn-ink-muted); font-weight: 600; }

.qtn-pricing thead th {
  background: var(--qtn-accent);
  color: #fff;
  padding: 2.2mm 2.5mm;
  font-size: 8pt;
  font-weight: 650;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  text-align: left;
}
.qtn-pricing thead th:first-child { border-top-left-radius: 4pt; }
.qtn-pricing thead th:last-child { border-top-right-radius: 4pt; }
.qtn-pricing tbody td { border-bottom: 1px solid var(--qtn-line); padding: 2.2mm 2.5mm; vertical-align: top; }
/* Alignment follows the column, not its position: an author can choose which
   columns print, so "the third one is a number" stopped being true. */
.qtn-pricing .qtn-cell-numeric {
  text-align: right;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}
.qtn-pricing .qtn-line td:first-child { font-weight: 550; }
.qtn-line-description { margin-top: 0.8mm; color: var(--qtn-ink-muted); font-size: 8.5pt; }
.qtn-pricing .qtn-section td, .qtn-pricing .qtn-line-heading td {
  background: var(--qtn-subtle);
  font-size: 8.5pt;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--qtn-ink-muted);
}
.qtn-pricing .qtn-line-note td { color: var(--qtn-ink-muted); font-size: 9pt; font-style: italic; }
.qtn-pricing .qtn-line--optional td { color: var(--qtn-ink-muted); }
.qtn-badge {
  display: inline-block;
  margin-left: 1.5mm;
  border-radius: 999px;
  background: var(--qtn-subtle);
  border: 1px solid var(--qtn-line-strong);
  padding: 0.2mm 1.6mm;
  color: var(--qtn-ink-muted);
  font-size: 7.5pt;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.qtn-pricing tfoot th, .qtn-pricing tfoot td {
  border: 0;
  padding: 1.4mm 2.5mm;
  text-align: right;
  font-weight: 500;
}
.qtn-pricing tfoot th { color: var(--qtn-ink-muted); font-weight: 500; }
.qtn-pricing tfoot tr:first-child th, .qtn-pricing tfoot tr:first-child td { padding-top: 3mm; }
.qtn-pricing .qtn-total th, .qtn-pricing .qtn-total td {
  border-top: 1.5pt solid var(--qtn-accent);
  padding-top: 2.2mm;
  color: var(--qtn-ink);
  font-size: 12pt;
  font-weight: 700;
}
.qtn-pricing .qtn-optional th, .qtn-pricing .qtn-optional td {
  color: var(--qtn-ink-subtle);
  font-size: 9pt;
}

/* --- pricing page intro --------------------------------------------------- */

.qtn-commercial-header {
  display: grid;
  gap: 4mm;
  margin-bottom: 5mm;
}
.qtn-commercial-top {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8mm;
}
.qtn-commercial-brand {
  display: flex;
  align-items: flex-start;
  gap: 3.5mm;
  min-width: 0;
  flex: 1 1 60%;
}
.qtn-commercial-company {
  font-size: 11pt;
  font-weight: 620;
  letter-spacing: -0.015em;
}
.qtn-commercial-line {
  margin-top: 1mm;
  color: var(--qtn-ink-muted);
  font-size: 8.5pt;
}
.qtn-commercial-meta { flex: 0 0 auto; text-align: right; }
.qtn-commercial-heading {
  display: grid;
  gap: 1mm;
}
.qtn-commercial-kicker {
  color: var(--qtn-ink-subtle);
  font-size: 7.5pt;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}
.qtn-commercial-heading h2 {
  border-bottom: 0;
  padding-bottom: 0;
  font-size: 14pt;
}

/* --- closing --------------------------------------------------------------- */

.qtn-closing { margin-top: 8mm; display: grid; gap: 5mm; }
.qtn-note h3 {
  font-size: 8pt;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--qtn-ink-subtle);
  margin-bottom: 1.5mm;
}
.qtn-note-body { color: var(--qtn-ink-muted); font-size: 9.5pt; white-space: pre-line; }
.qtn-note--boxed {
  border: 1px solid var(--qtn-line);
  border-left: 2.5pt solid var(--qtn-accent);
  border-radius: var(--qtn-radius);
  background: var(--qtn-subtle);
  padding: 4mm;
}

.qtn-footer {
  margin-top: 10mm;
  padding-top: 3mm;
  border-top: 1px solid var(--qtn-line);
  color: var(--qtn-ink-subtle);
  font-size: 8.5pt;
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 3mm;
}

/* --- print ----------------------------------------------------------------- */

@media print {
  @page { size: ${theme.pageSize}; margin: 12mm 13mm; }
  .qtn-document {
    max-width: none;
    padding: 0;
    box-shadow: none;
    font-size: 10pt;
  }
  .qtn-document,
  .qtn-pricing thead th,
  .qtn-monogram,
  .qtn-rule {
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  /* Keep a row and its heading together, and repeat pricing headers per page. */
  .qtn-pricing thead { display: table-header-group; }
  .qtn-pricing tr, .qtn-party, .qtn-note, .qtn-letterhead, .qtn-block--document [data-layout-block] {
    break-inside: avoid;
  }
  .qtn-block h2, .qtn-block h3 { break-after: avoid; }
  .qtn-block--document :is(h1, h2, h3, h4) { break-after: avoid; }
  /*
   * The author's explicit "keep this on one page", set in the template editor.
   * The editor's paginator moves such a block to the next page; this is the
   * same instruction for Chrome's print engine, so the PDF agrees with what the
   * author was shown rather than re-flowing it.
   */
  .qtn-block--document [data-keep-together="true"] {
    break-inside: avoid;
    page-break-inside: avoid;
  }
  :is(.qtn-page-break, .qtn-block--document [data-page-break="true"]) {
    break-after: page;
    margin: 0;
    border-top: 0;
    display: block;
    height: 0;
  }
  :is(.qtn-page-break, .qtn-block--document [data-page-break="true"])::after { content: none; }
  .qtn-block[data-new-page="true"] {
    break-before: page;
    margin-top: 0;
    padding-top: 0;
    border-top: 0;
  }
  .qtn-block[data-new-page="true"]::before { content: none; }
  .qtn-block { margin-bottom: 5mm; }
}
`.trim();
}
