import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { getConnectionToken } from '@nestjs/mongoose';
import { Connection, Types } from 'mongoose';

import { AppModule } from 'src/app.module';
import { NARRATIVE_TAG, narrativeToBlock } from './package-narrative';

/**
 * Moves package itinerary/inclusions/exclusions into saved blocks.
 *
 *   npm run migrate:package-narrative            # dry run, changes nothing
 *   npm run migrate:package-narrative -- --apply # writes the saved blocks
 *   npm run migrate:package-narrative -- --apply --clear
 *
 * Deliberately two-phase. `--apply` only *copies* the content into the library;
 * the package keeps its own copy, so documents mid-flight and anything still
 * reading the old fields behave exactly as before and the step is reversible by
 * deleting the created blocks. `--clear` is the destructive half and is meant to
 * be run later, once the library entries have been eyeballed.
 *
 * Idempotent: created blocks are tagged, and a package whose block already exists
 * is skipped rather than duplicated.
 */
async function migrate(): Promise<void> {
  const logger = new Logger('MigratePackageNarrative');
  const apply = process.argv.includes('--apply');
  const clear = process.argv.includes('--clear');

  if (clear && !apply) {
    logger.error('--clear only makes sense together with --apply. Nothing was changed.');
    process.exitCode = 1;
    return;
  }

  const app = await NestFactory.createApplicationContext(AppModule, { bufferLogs: false });

  try {
    const connection = app.get<Connection>(getConnectionToken());
    const packages = connection.collection('packages');
    const blocks = connection.collection('reusable_blocks');

    const candidates = await packages
      .find({
        $or: [
          { itinerary: { $exists: true, $ne: [] } },
          { inclusions: { $exists: true, $ne: [] } },
          { exclusions: { $exists: true, $ne: [] } },
        ],
      })
      .toArray();

    logger.log(
      `${candidates.length} package(s) carry narrative content. Mode: ${
        apply ? (clear ? 'apply + clear' : 'apply') : 'dry run'
      }.`,
    );

    let created = 0;
    let skipped = 0;
    let cleared = 0;

    for (const entry of candidates) {
      const migration = narrativeToBlock({
        name: String(entry.name ?? 'Package'),
        category: typeof entry.category === 'string' ? entry.category : undefined,
        itinerary: Array.isArray(entry.itinerary) ? (entry.itinerary as never) : [],
        inclusions: Array.isArray(entry.inclusions) ? (entry.inclusions as string[]) : [],
        exclusions: Array.isArray(entry.exclusions) ? (entry.exclusions as string[]) : [],
      });

      if (!migration) {
        // Matched the query but every row was blank — nothing worth saving, so
        // there is no block to create. The junk rows are still cleared, so a
        // later run has no candidates left and the migration converges.
        skipped += 1;
        if (apply && clear) {
          // eslint-disable-next-line no-await-in-loop
          await packages.updateOne(
            { _id: entry._id },
            { $set: { itinerary: [], inclusions: [], exclusions: [], updatedAt: new Date() } },
          );
          cleared += 1;
        }
        continue;
      }

      // eslint-disable-next-line no-await-in-loop
      const existing = await blocks.findOne({
        organizationId: entry.organizationId,
        name: migration.name,
        tags: NARRATIVE_TAG,
      });

      if (existing) {
        logger.log(`skip   ${migration.name} (already migrated)`);
        skipped += 1;
      } else {
        const rows = migration.blockJson.blocks
          .map((block) => `${block.type}:${block.items.length}`)
          .join(' ');
        logger.log(`create ${migration.name} [${rows}]`);

        if (apply) {
          // eslint-disable-next-line no-await-in-loop
          await blocks.insertOne({
            organizationId: entry.organizationId,
            name: migration.name,
            description: migration.description,
            category: migration.category,
            tags: migration.tags,
            blockJson: migration.blockJson,
            // Published: the content was already reaching customers via the package.
            status: 'PUBLISHED',
            usageCount: 0,
            createdById: (entry.createdById as Types.ObjectId | null) ?? null,
            archivedAt: null,
            createdAt: new Date(),
            updatedAt: new Date(),
          });
          created += 1;
        }
      }

      if (apply && clear) {
        // eslint-disable-next-line no-await-in-loop
        await packages.updateOne(
          { _id: entry._id },
          { $set: { itinerary: [], inclusions: [], exclusions: [], updatedAt: new Date() } },
        );
        cleared += 1;
      }
    }

    logger.log(
      `Done. created=${created} skipped=${skipped} cleared=${cleared}` +
        (apply ? '' : ' — dry run, nothing was written. Re-run with --apply.'),
    );

    if (apply && !clear) {
      logger.log(
        'Packages still hold their own copy. Review the new saved blocks, then re-run with --apply --clear.',
      );
    }
  } finally {
    await app.close();
  }
}

void migrate().catch((error: unknown) => {
  new Logger('MigratePackageNarrative').error(
    error instanceof Error ? error.message : String(error),
    error instanceof Error ? error.stack : undefined,
  );
  process.exitCode = 1;
});
