import { Injectable, Logger } from '@nestjs/common';

import { DomainException } from 'src/common/errors/domain.exception';
import { ErrorCodes } from 'src/common/errors/error-codes';
import { CompiledDocument } from 'src/template-engine/document.compiler';
import { BrowserService } from './browser.service';
import { HtmlRendererService } from './html-renderer.service';

export interface PdfResult {
  buffer: Buffer;
  contentType: 'application/pdf';
}

/**
 * Structured JSON → renderer → HTML → PDF (map.md §35).
 *
 * The HTML half is shared with the web preview and the public page, so a PDF is
 * the same document the customer sees on screen, printed by the same stylesheet.
 * Page numbers are the one thing only this path can do: CSS cannot number pages
 * in a browser's print dialog, so `showPageNumbers` is honoured here and nowhere
 * else.
 *
 * Without a browser binary the endpoint still answers
 * PDF_RENDERER_NOT_CONFIGURED — an explicit error rather than a placeholder file
 * that looks real.
 */
@Injectable()
export class PdfService {
  private readonly logger = new Logger(PdfService.name);

  constructor(
    private readonly html: HtmlRendererService,
    private readonly browsers: BrowserService,
  ) {}

  renderHtml(document: CompiledDocument): string {
    return this.html.renderPage(document);
  }

  isConfigured(): boolean {
    return this.browsers.isAvailable();
  }

  async generate(document: CompiledDocument): Promise<PdfResult> {
    if (!this.isConfigured()) {
      throw new DomainException(
        ErrorCodes.PDF_RENDERER_NOT_CONFIGURED,
        'PDF generation is not configured on this deployment. Set CHROME_PATH to a Chrome or Chromium binary. The document is available as HTML.',
        501,
      );
    }

    const browser = await this.browsers.instance();
    const page = await browser.newPage();

    try {
      // The stylesheet travels inside the markup, so there is nothing external to
      // wait for beyond any remote images the document references.
      await page.setContent(this.renderHtml(document), {
        waitUntil: 'load',
        timeout: 20_000,
      });

      const landscape = false;
      const showPageNumbers = document.style?.showPageNumbers !== false;

      const buffer = await page.pdf({
        format: document.style?.pageSize === 'LETTER' ? 'letter' : 'a4',
        landscape,
        // The document's own @page margins are for the print dialog; here the
        // margin is ours, and printBackground is what keeps the accent visible.
        printBackground: true,
        margin: { top: '12mm', bottom: showPageNumbers ? '16mm' : '12mm', left: '13mm', right: '13mm' },
        displayHeaderFooter: showPageNumbers,
        headerTemplate: '<span></span>',
        footerTemplate: showPageNumbers ? footer(document) : '<span></span>',
      });

      return { buffer: Buffer.from(buffer), contentType: 'application/pdf' };
    } catch (error) {
      this.logger.error(
        `PDF generation failed for ${document.meta?.documentNumber ?? 'document'}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw DomainException.invalid(
        ErrorCodes.PDF_RENDERER_NOT_CONFIGURED,
        'Could not produce the PDF. The document is available as HTML.',
      );
    } finally {
      await page.close().catch(() => undefined);
    }
  }
}

/**
 * "Q-2026-00002 · Page 1 of 2", in the document's own quiet grey.
 *
 * Chrome substitutes pageNumber/totalPages inside the footer template; the text
 * is escaped because the document number is user data.
 */
function footer(document: CompiledDocument): string {
  const label = escapeHtml(document.meta?.documentNumber ?? '');

  return `<div style="width:100%;padding:0 13mm;font-family:Helvetica,Arial,sans-serif;font-size:7pt;color:#8b939d;display:flex;justify-content:space-between;">
  <span>${label}</span>
  <span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span>
</div>`;
}

function escapeHtml(value: string): string {
  return value.replace(/[<>&"]/g, (character) => {
    switch (character) {
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '&':
        return '&amp;';
      default:
        return '&quot;';
    }
  });
}
