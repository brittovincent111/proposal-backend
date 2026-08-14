import { Inject, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { existsSync } from 'node:fs';
import type { Browser, LaunchOptions } from 'puppeteer-core';

import { APP_CONFIG } from 'src/common/config/config.module';
import { AppConfig } from 'src/common/config/configuration';

/**
 * puppeteer-core is ESM-only, and this service compiles to CommonJS, so a plain
 * import would become `require()` and throw ERR_REQUIRE_ESM on any Node without
 * require(esm). The Function wrapper keeps a genuine dynamic import through the
 * TypeScript CJS transform.
 *
 * Loading it lazily is a second benefit: the app boots, and every other endpoint
 * works, on a deployment that has no browser and never asks for a PDF.
 */
const importEsm = new Function('specifier', 'return import(specifier)') as (
  specifier: string,
) => Promise<unknown>;

interface PuppeteerModule {
  launch(options: LaunchOptions): Promise<Browser>;
}

/**
 * Where a Chrome/Chromium binary usually lives, tried in order when CHROME_PATH
 * is not set. Covers a developer's Mac and the usual Linux images.
 */
const CANDIDATES = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium-browser',
  '/usr/bin/chromium',
  '/snap/bin/chromium',
];

/**
 * Owns the headless browser used for PDF rendering.
 *
 * One instance is shared across requests and launched on first use — starting a
 * browser costs a second or more, which would otherwise be paid on every
 * download. It is relaunched automatically if it dies.
 *
 * `puppeteer-core` is deliberate: it carries no bundled Chromium, so the
 * dependency stays small and the deployment decides which browser to use. When
 * none is present the PDF endpoint degrades to a clear error rather than pulling
 * a 170MB download into every install.
 */
@Injectable()
export class BrowserService implements OnModuleDestroy {
  private readonly logger = new Logger(BrowserService.name);
  private browser: Browser | null = null;
  private launching: Promise<Browser> | null = null;

  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  /** The resolved binary, or null when this deployment has no browser. */
  executablePath(): string | null {
    const configured = this.config.CHROME_PATH?.trim();
    if (configured) return existsSync(configured) ? configured : null;
    return CANDIDATES.find((candidate) => existsSync(candidate)) ?? null;
  }

  isAvailable(): boolean {
    return this.executablePath() !== null;
  }

  /** Shared browser, launched once. Concurrent callers await the same launch. */
  async instance(): Promise<Browser> {
    if (this.browser?.connected) return this.browser;

    this.launching ??= (async () => {
      const executablePath = this.executablePath();
      if (!executablePath) throw new Error('No Chrome or Chromium binary found.');

      const module = (await importEsm('puppeteer-core')) as
        | PuppeteerModule
        | { default: PuppeteerModule };
      const puppeteer = 'launch' in module ? module : module.default;

      const browser = await puppeteer.launch({
        executablePath,
        // --no-sandbox is required in most containers; there is no untrusted page
        // here, only our own rendered HTML.
        args: ['--no-sandbox', '--disable-dev-shm-usage'],
      });

      this.logger.log(`PDF browser ready (${executablePath})`);
      this.browser = browser;
      return browser;
    })();

    try {
      return await this.launching;
    } finally {
      this.launching = null;
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.browser?.close().catch(() => undefined);
    this.browser = null;
  }
}
