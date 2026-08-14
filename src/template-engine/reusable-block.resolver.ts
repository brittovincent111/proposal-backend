import { Injectable } from '@nestjs/common';

import { TemplateBlock, blockSchema } from './template.contract';

export interface ResolvableBlock {
  id: string;
  name: string;
  blockJson: Record<string, unknown>;
}

/**
 * Turns a saved library block into template blocks — map.md §15.
 *
 * Like packages, the expansion is by value: the document keeps the content it
 * had at generation time, so editing the library later leaves history alone.
 */
@Injectable()
export class ReusableBlockResolver {
  resolve(entry: ResolvableBlock): TemplateBlock[] {
    const raw = (entry.blockJson as { blocks?: unknown[] }).blocks ?? [];
    return raw.flatMap((block) => {
      const parsed = blockSchema.safeParse(block);
      // A block that no longer parses is skipped rather than failing generation:
      // one stale library entry must not make a document impossible to produce.
      return parsed.success ? [parsed.data] : [];
    });
  }
}
