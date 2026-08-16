import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { getConnectionToken } from '@nestjs/mongoose';
import { Connection } from 'mongoose';

import { AppModule } from 'src/app.module';
import { runSeed } from 'src/seed/seed.cli';

/**
 * Empties every collection, then reseeds — the cutover to the proposal/quotation split.
 *
 *   npm run reset:documents                                        # dry run, writes nothing
 *   npm run reset:documents -- --apply --i-know-this-deletes-everything
 *   npm run reset:documents -- --apply --i-know-this-deletes-everything --no-seed
 *
 * The split changed the shape of templates and documents beyond what a field
 * migration can carry across: templates lost their line items and packages,
 * documents gained a required `kind`, and no existing row can honestly be called
 * one or the other. With no production users, wiping is both the correct answer
 * and the cheap one.
 *
 * Two guards rather than the house `--apply` alone. A migration that rewrites
 * rows can be reasoned about from its diff; one that empties thirty collections
 * cannot, so the second flag has to be typed out in full.
 */

/**
 * Every collection, named explicitly.
 *
 * Not `dropDatabase()` and not `listCollections()`. An explicit list is
 * reviewable in the diff and cannot quietly grow to include something added
 * later without anyone deciding it should be dropped.
 */
const COLLECTIONS = [
  // identity
  'users',
  'refresh_tokens',
  'credential_tokens',
  'organizations',
  'organization_settings',
  'organization_members',
  // tenant content
  'customers',
  'items',
  'tax_rates',
  'packages',
  'reusable_blocks',
  'templates',
  'template_versions',
  'documents',
  'document_revisions',
  'document_events',
  'document_sequences',
  'document_acceptances',
  'document_change_requests',
  // marketing and platform
  'leads',
  'blog_posts',
  'blog_topic_recommendations',
  // billing
  'billing_counters',
  'billing_discounts',
  'billing_discount_redemptions',
  'billing_invoices',
  'billing_plans',
  'billing_subscriptions',
  'billing_webhook_events',
  // reference data
  'business_categories',
];

/**
 * Reference collections that rebuild themselves, listed so nobody "fixes" this
 * later by adding them to a keep-list: `billing_plans` re-upserts from
 * PLAN_CATALOG in PlansService.onModuleInit, and `business_categories` from
 * DEFAULT_BUSINESS_CATEGORIES the first time BusinessCategoriesService is asked.
 */
const SELF_HEALING = new Set(['billing_plans', 'business_categories']);

async function reset(): Promise<void> {
  const logger = new Logger('ResetDocumentModel');
  const apply = process.argv.includes('--apply');
  const confirmed = process.argv.includes('--i-know-this-deletes-everything');
  const seed = !process.argv.includes('--no-seed');

  if (apply && !confirmed) {
    logger.error(
      '--apply also needs --i-know-this-deletes-everything. Nothing was changed.',
    );
    process.exitCode = 1;
    return;
  }

  const app = await NestFactory.createApplicationContext(AppModule, { bufferLogs: false });

  try {
    const connection = app.get<Connection>(getConnectionToken());

    logger.log(apply ? 'Mode: apply — this empties the database.' : 'Mode: dry run.');

    let total = 0;
    for (const name of COLLECTIONS) {
      const collection = connection.collection(name);
      // eslint-disable-next-line no-await-in-loop
      const count = await collection.countDocuments();
      total += count;

      if (count === 0) continue;

      const note = SELF_HEALING.has(name) ? ' (rebuilds itself on next boot)' : '';
      logger.log(`${apply ? 'clearing' : 'would clear'} ${name}: ${count}${note}`);

      if (apply) {
        // deleteMany, not drop: drop() throws NamespaceNotFound on a collection
        // that was never created, and it also discards the index definitions —
        // which would leave the reseed running against a `documents` collection
        // with no unique (organizationId, documentNumber) guard.
        // eslint-disable-next-line no-await-in-loop
        await collection.deleteMany({});
      }
    }

    logger.log(
      `${apply ? 'Cleared' : 'Would clear'} ${total} document(s) across ${COLLECTIONS.length} collection(s).`,
    );

    if (!apply) {
      logger.log('Dry run — nothing was written.');
      logger.log('Re-run with: --apply --i-know-this-deletes-everything');
      return;
    }

    if (!seed) {
      logger.log('Skipping the reseed (--no-seed). Run `npm run seed` when ready.');
      return;
    }

    // In-process, on the same context: an `&&`-chained npm script would also run
    // after a dry run, which is exactly what a dry run must never do.
    logger.log('Reseeding…');
    await runSeed(app, new Logger('Seed'), true);
  } finally {
    await app.close();
  }
}

void reset().catch((error: unknown) => {
  new Logger('ResetDocumentModel').error(
    error instanceof Error ? error.message : String(error),
    error instanceof Error ? error.stack : undefined,
  );
  process.exitCode = 1;
});
