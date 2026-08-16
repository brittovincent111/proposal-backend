import { INestApplicationContext, Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { getConnectionToken } from '@nestjs/mongoose';
import { Connection } from 'mongoose';

import { AppModule } from 'src/app.module';
import { AuthService } from 'src/auth/auth.service';
import { CatalogService } from 'src/catalog/catalog.service';
import { CustomersService } from 'src/customers/customers.service';
import { DocumentsService } from 'src/documents/documents.service';
import { PackagesService } from 'src/packages/packages.service';
import { TemplatesService } from 'src/templates/templates.service';
import {
  SEED_CUSTOMER,
  SEED_ITEMS,
  SEED_ORGANIZATION,
  SEED_PACKAGE,
  SEED_TEMPLATE,
} from './seed.data';

/**
 * Idempotent-ish demo seed: it refuses to run against a database that already
 * has the demo owner, so re-running never silently duplicates an organization.
 * Pass --force to drop the demo user first.
 *
 * Takes the context rather than opening one so the reset CLI can wipe and reseed
 * in a single process. Chaining `db reset && seed` as npm scripts would run the
 * seed after a *dry run* too, which is the one thing a dry run must never do.
 */
export async function runSeed(
  app: INestApplicationContext,
  logger: Logger,
  force = process.argv.includes('--force'),
): Promise<void> {
  const connection = app.get<Connection>(getConnectionToken());
  const auth = app.get(AuthService);
  const customers = app.get(CustomersService);
  const catalog = app.get(CatalogService);
  const packages = app.get(PackagesService);
  const templates = app.get(TemplatesService);
  const documents = app.get(DocumentsService);

  const existing = await connection
    .collection('users')
    .findOne({ email: SEED_ORGANIZATION.ownerEmail });

  if (existing && !force) {
    logger.warn(
      `${SEED_ORGANIZATION.ownerEmail} already exists. Re-run with --force to wipe the demo data.`,
    );
    return;
  }

  if (existing) {
    // Only the demo organization is removed; real tenants are never touched.
    const member = await connection
      .collection('organization_members')
      .findOne({ userId: existing._id });
    const organizationId = member?.organizationId;

    if (organizationId) {
      for (const name of [
        'organizations',
        'organization_settings',
        'organization_members',
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
      ]) {
        await connection
          .collection(name)
          .deleteMany(name === 'organizations' ? { _id: organizationId } : { organizationId });
      }
    }
    await connection.collection('users').deleteOne({ _id: existing._id });
    logger.log('Removed previous demo data.');
  }

  const { userId } = await auth.register(
    {
      email: SEED_ORGANIZATION.ownerEmail,
      password: SEED_ORGANIZATION.ownerPassword,
      organizationName: SEED_ORGANIZATION.name,
      firstName: 'Demo',
      lastName: 'Owner',
    },
    {},
  );

  const profile = await auth.profile(userId);
  const organizationId = profile.organizations[0].id;
  logger.log(`Created organization ${SEED_ORGANIZATION.name} (${organizationId})`);

  const taxRates = await catalog.taxSnapshots(organizationId);
  const gst18 = taxRates.find((rate) => rate.percent === 18) ?? taxRates[0];

  const items = [];
  for (const item of SEED_ITEMS) {
    items.push(await catalog.createItem(organizationId, userId, { ...item, taxRateId: gst18?.id }));
  }
  logger.log(`Created ${items.length} catalogue items`);

  const created = await packages.create(organizationId, userId, {
    ...SEED_PACKAGE,
    lines: [
      { itemId: items[0]._id.toString(), name: items[0].name, unit: 'day', quantity: 4, rate: items[0].defaultRate, taxRateId: gst18?.id },
      { itemId: items[1]._id.toString(), name: items[1].name, unit: 'night', quantity: 2, rate: items[1].defaultRate, taxRateId: gst18?.id },
      { itemId: items[2]._id.toString(), name: items[2].name, unit: 'night', quantity: 1, rate: items[2].defaultRate, taxRateId: gst18?.id },
      { itemId: items[3]._id.toString(), name: items[3].name, unit: 'nos', quantity: 1, rate: items[3].defaultRate, taxRateId: gst18?.id, optional: true },
    ],
  });
  await packages.publish(organizationId, created._id.toString());
  logger.log(`Created package ${created.name}`);

  const customer = await customers.create(organizationId, userId, SEED_CUSTOMER);

  const template = await templates.create(organizationId, userId, {
    name: SEED_TEMPLATE.name,
    description: SEED_TEMPLATE.description,
    category: SEED_TEMPLATE.category,
    industry: SEED_TEMPLATE.industry,
    draft: {
      schemaJson: SEED_TEMPLATE.schemaJson,
      fieldSchemaJson: SEED_TEMPLATE.fieldSchemaJson,
      settingsJson: SEED_TEMPLATE.settingsJson,
    },
  });
  const templateId = template.template.id;
  await templates.publish(organizationId, templateId, { changeNote: 'Initial version' });
  logger.log(`Published template ${SEED_TEMPLATE.name}`);

  const proposal = await documents.create(organizationId, userId, {
    kind: 'PROPOSAL',
    templateId,
    customerId: customer._id.toString(),
    title: 'Kerala trip — Ravi Menon',
    answers: {
      destination: 'Munnar & Alleppey',
      travel_date: '2026-09-12',
      nights: 3,
      adults: 2,
      children: 1,
      hotel_category: 'Deluxe',
      needs_airport_pickup: true,
      arrival_flight: 'AI 501',
    },
  });

  const proposalId = proposal._id.toString();
  await documents.generate(organizationId, proposalId, userId);
  logger.log(`Generated proposal ${proposal.documentNumber}`);

  // Both kinds, so a reseeded database demonstrates both paths — and so the
  // wall is visible: the proposal above carries no total, this one does.
  const quotation = await documents.create(organizationId, userId, {
    kind: 'QUOTATION',
    customerId: customer._id.toString(),
    title: 'Kerala trip — Ravi Menon',
  });
  const quotationId = quotation._id.toString();
  await documents.addPackage(organizationId, quotationId, userId, {
    packageId: created._id.toString(),
  });
  const revision = await documents.generate(organizationId, quotationId, userId);
  logger.log(`Generated quotation ${quotation.documentNumber}`);

  logger.log('');
  logger.log('Demo data ready.');
  logger.log(`  Email:    ${SEED_ORGANIZATION.ownerEmail}`);
  logger.log(`  Password: ${SEED_ORGANIZATION.ownerPassword}`);
  logger.log(`  Total:    ${revision.grandTotal / 100}`);
}

// Only when run directly: importing this module from the reset CLI must not
// execute the seed as an import side effect.
if (require.main === module) {
  void (async () => {
    const logger = new Logger('Seed');
    const app = await NestFactory.createApplicationContext(AppModule, { bufferLogs: false });
    try {
      await runSeed(app, logger);
    } catch (error) {
      logger.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    } finally {
      await app.close();
    }
  })();
}
