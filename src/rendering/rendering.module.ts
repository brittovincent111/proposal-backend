import { Module } from '@nestjs/common';

import { BrowserService } from './browser.service';
import { HtmlRendererService } from './html-renderer.service';
import { PdfService } from './pdf.service';

@Module({
  providers: [HtmlRendererService, PdfService, BrowserService],
  exports: [HtmlRendererService, PdfService],
})
export class RenderingModule {}
