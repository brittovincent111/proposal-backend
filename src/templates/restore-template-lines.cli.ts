import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { getConnectionToken } from '@nestjs/mongoose';
import { Connection, Types } from 'mongoose';

import { AppModule } from 'src/app.module';

/**
 * Recovers template default lines lost to the draft-clone bug.
 *
 *   npm run restore:template-lines            # dry run, changes nothing
 *   npm run restore:template-lines -- --apply
 *
 * `draftVersion()` used to clone a new draft from the published version without
 * carrying `linesJson` across, so publish → edit silently discarded a template's
 * default line items. The bug is fixed, but templates that went through that cycle
 * lost their lines.
 *
 * Nothing is actually gone: versions are immutable rows, so the lines still sit on
 * the older version that had them. This copies the most recent non-empty set
 * forward into the template's editable draft.
 *
 * Two rules it will not break:
 *  - A published version is never rewritten. That immutability is what stops a
 *    template edit from altering a quotation already issued, so the recovery lands
 *    in a draft and the owner publishes when they are ready.
 *  - A draft that already has lines is left alone, which makes re-runs safe.
 */
async function restore(): Promise<void> {
  const logger = new Logger('RestoreTemplateLines');
  const apply = process.argv.includes('--apply');
  const app = await NestFactory.createApplicationContext(AppModule, { bufferLogs: false });

  try {
    const connection = app.get<Connection>(getConnectionToken());
    const templates = connection.collection('templates');
    const versions = connection.collection('template_versions');

    const all = await templates.find({ archivedAt: null }).toArray();
    logger.log(`Checking ${all.length} template(s). Mode: ${apply ? 'apply' : 'dry run'}.`);

    let restored = 0;
    let created = 0;
    let healthy = 0;
    let unrecoverable = 0;

    for (const template of all) {
      // eslint-disable-next-line no-await-in-loop
      const history = await versions
        .find({ templateId: template._id })
        .sort({ versionNumber: -1 })
        .toArray();

      const lineCount = (version: Record<string, unknown> | undefined) =>
        ((version?.linesJson as { lines?: unknown[] } | undefined)?.lines ?? []).length;

      const draft = history.find((version) => !version.publishedAt);
      const newest = history[0];

      // Whatever the template currently offers a new quotation.
      const effective = draft ?? newest;
      if (lineCount(effective) > 0) {
        healthy += 1;
        continue;
      }

      const source = history.find((version) => lineCount(version) > 0);
      if (!source) {
        // Never had default lines — nothing to recover, and nothing wrong.
        healthy += 1;
        continue;
      }

      const rows = lineCount(source);
      const names = ((source.linesJson as { lines: Array<{ name?: string }> }).lines ?? [])
        .map((line) => line.name ?? '')
        .filter(Boolean)
        .slice(0, 3)
        .join(', ');

      if (draft) {
        logger.log(
          `restore ${String(template.name)}: ${rows} line(s) from v${String(source.versionNumber)} → draft v${String(draft.versionNumber)} [${names}]`,
        );
        if (apply) {
          // eslint-disable-next-line no-await-in-loop
          await versions.updateOne(
            { _id: draft._id },
            { $set: { linesJson: source.linesJson, updatedAt: new Date() } },
          );
          restored += 1;
        }
        continue;
      }

      // No editable draft: make one from the newest version, carrying the lines.
      const nextNumber = Number(newest?.versionNumber ?? 0) + 1;
      logger.log(
        `new draft ${String(template.name)}: v${nextNumber} with ${rows} line(s) from v${String(source.versionNumber)} [${names}]`,
      );

      if (apply) {
        const draftId = new Types.ObjectId();
        // eslint-disable-next-line no-await-in-loop
        await versions.insertOne({
          _id: draftId,
          templateId: template._id,
          organizationId: template.organizationId,
          versionNumber: nextNumber,
          schemaJson: newest?.schemaJson ?? {},
          fieldSchemaJson: newest?.fieldSchemaJson ?? {},
          styleSchemaJson: newest?.styleSchemaJson ?? {},
          settingsJson: newest?.settingsJson ?? {},
          linesJson: source.linesJson,
          changeNote: '',
          createdById: template.createdById ?? null,
          publishedAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
        // eslint-disable-next-line no-await-in-loop
        await templates.updateOne(
          { _id: template._id },
          { $set: { draftVersionId: draftId, updatedAt: new Date() } },
        );
        created += 1;
      }
    }

    logger.log(
      `Done. restored=${restored} newDrafts=${created} healthy=${healthy} unrecoverable=${unrecoverable}` +
        (apply ? '' : ' — dry run, nothing was written. Re-run with --apply.'),
    );
    if (apply && restored + created > 0) {
      logger.log('Recovered lines are in each template\'s draft. Publish the template to apply them.');
    }
  } finally {
    await app.close();
  }
}

void restore().catch((error: unknown) => {
  new Logger('RestoreTemplateLines').error(
    error instanceof Error ? error.message : String(error),
    error instanceof Error ? error.stack : undefined,
  );
  process.exitCode = 1;
});
