import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { getModelToken } from '@nestjs/mongoose';
import { Model } from 'mongoose';

import { AppModule } from 'src/app.module';
import { PLAN_CATALOG } from './plan-catalog';
import { Plan, PlanDocument } from './plan.schema';

/**
 * Pushes `plan-catalog.ts` onto the database.
 *
 *   npm run billing:sync-plans -- --dry
 *   npm run billing:sync-plans
 *
 * Boot-time seeding is deliberately insert-only, so a price edited in the
 * catalogue never reaches a database that already has the plan — that is what
 * stops a redeploy reverting a price someone changed in /admin/plans. This is
 * the explicit opposite: run it when the catalogue *is* the intended truth.
 *
 * Razorpay plan ids are preserved. They are configured per environment and are
 * not the catalogue's to overwrite; wiping them would break checkout on every
 * paid plan.
 */
async function main(): Promise<void> {
  const logger = new Logger('SyncPlanCatalog');
  const dryRun = process.argv.includes('--dry');
  const app = await NestFactory.createApplicationContext(AppModule, { bufferLogs: false });

  try {
    const plans = app.get<Model<PlanDocument>>(getModelToken(Plan.name));

    for (const entry of PLAN_CATALOG) {
      const existing = await plans.findOne({ code: entry.code });

      if (!existing) {
        if (dryRun) {
          logger.log(`CREATE ${entry.code} (${entry.name})`);
          continue;
        }
        await plans.create(entry);
        logger.log(`Created "${entry.code}"`);
        continue;
      }

      const changes: string[] = [];
      if (existing.yearlyPrice !== entry.yearlyPrice) {
        changes.push(`yearly ${existing.yearlyPrice} → ${entry.yearlyPrice}`);
      }
      if (existing.name !== entry.name) changes.push(`name "${existing.name}" → "${entry.name}"`);
      if (existing.isContactSales !== entry.isContactSales) {
        changes.push(`contactSales ${existing.isContactSales} → ${entry.isContactSales}`);
      }
      if (existing.features.join('|') !== entry.features.join('|')) changes.push('features');
      if (JSON.stringify(existing.limits) !== JSON.stringify(entry.limits)) changes.push('limits');

      if (!changes.length) {
        logger.log(`"${entry.code}" already matches`);
        continue;
      }

      if (dryRun) {
        logger.log(`UPDATE ${entry.code}: ${changes.join(', ')}`);
        continue;
      }

      existing.set({
        name: entry.name,
        tagline: entry.tagline,
        currency: entry.currency,
        yearlyPrice: entry.yearlyPrice,
        trialDays: entry.trialDays,
        features: entry.features,
        isPublic: entry.isPublic,
        isDefault: entry.isDefault,
        isFeatured: entry.isFeatured,
        isContactSales: entry.isContactSales,
        sortOrder: entry.sortOrder,
      });
      existing.set('limits', { ...existing.limits, ...entry.limits });
      // `gateway` is intentionally untouched — see the note above.

      await existing.save();
      logger.log(`Updated "${entry.code}": ${changes.join(', ')}`);
    }

    if (dryRun) logger.log('Dry run — nothing was written.');
  } finally {
    await app.close();
  }
}

void main();
