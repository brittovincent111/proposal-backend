import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, Model, Types } from 'mongoose';
import { z } from 'zod';

import { CatalogService } from 'src/catalog/catalog.service';
import { Page, escapeRegex, toPage } from 'src/common/dto/pagination.dto';
import { DomainException } from 'src/common/errors/domain.exception';
import { ErrorCodes } from 'src/common/errors/error-codes';
import { generateShareToken, hashToken, nextLocalId, toObjectId } from 'src/common/utils/ids';
import { CustomersService } from 'src/customers/customers.service';
import { OrganizationsService } from 'src/organizations/organizations.service';
import { PackagesService } from 'src/packages/packages.service';
import { HtmlRendererService } from 'src/rendering/html-renderer.service';
import { PdfService } from 'src/rendering/pdf.service';
import { ReusableBlocksService } from 'src/reusable-blocks/reusable-blocks.service';
import { ReusableBlockResolver } from 'src/template-engine/reusable-block.resolver';
import { TemplatesService } from 'src/templates/templates.service';
import {
  CompiledDocument,
  CompileMeta,
  DocumentCompiler,
} from 'src/template-engine/document.compiler';
import { PackageResolver } from 'src/template-engine/package.resolver';
import { PricingCalculator } from 'src/template-engine/pricing.calculator';
import {
  DocumentSection,
  Discount,
  ExtraCharge,
  emptyTotals,
} from 'src/template-engine/pricing.types';
import { TemplateSchemaValidator, formatZodError } from 'src/template-engine/template-schema.validator';
import {
  TemplateBlock,
  answersSchema,
  documentSectionSchema,
  discountSchema,
  extraChargeSchema,
} from 'src/template-engine/template.contract';
import { Answers, VariableResolver } from 'src/template-engine/variable.resolver';
import {
  AddPackageDto,
  CreateDocumentDto,
  CreateRevisionDto,
  DocumentQuery,
  SendDocumentDto,
  UpdateDocumentDto,
} from './dto/document.dto';
import { NumberingService } from './numbering.service';
import { RevisionDiffService } from './revision-diff.service';
import {
  DocumentEvent,
  DocumentEventDocument,
  DocumentEventType,
} from './schemas/document-event.schema';
import {
  DocumentRevision,
  DocumentRevisionDocument,
} from './schemas/document-revision.schema';
import {
  DocumentStatus,
  ProposalDocument,
  ProposalDocumentDocument,
} from './schemas/document.schema';
import { StatusTransitionService } from './status-transition.service';

const sectionsSchema = z.array(documentSectionSchema).max(50);
const chargesSchema = z.array(extraChargeSchema).max(50);

@Injectable()
export class DocumentsService {
  constructor(
    @InjectModel(ProposalDocument.name)
    private readonly documents: Model<ProposalDocumentDocument>,
    @InjectModel(DocumentRevision.name)
    private readonly revisions: Model<DocumentRevisionDocument>,
    @InjectModel(DocumentEvent.name)
    private readonly events: Model<DocumentEventDocument>,
    private readonly numbering: NumberingService,
    private readonly transitions: StatusTransitionService,
    private readonly diffs: RevisionDiffService,
    private readonly organizations: OrganizationsService,
    private readonly customers: CustomersService,
    private readonly templates: TemplatesService,
    private readonly catalog: CatalogService,
    private readonly packages: PackagesService,
    private readonly compiler: DocumentCompiler,
    private readonly pricing: PricingCalculator,
    private readonly validator: TemplateSchemaValidator,
    private readonly variables: VariableResolver,
    private readonly packageResolver: PackageResolver,
    private readonly blocks: ReusableBlocksService,
    private readonly blockResolver: ReusableBlockResolver,
    private readonly html: HtmlRendererService,
    private readonly pdf: PdfService,
  ) {}

  /* ------------------------------------------------------------------- read */

  /** List DTO: metadata and totals only — never the resolved snapshot (map.md §84). */
  async list(organizationId: string, query: DocumentQuery): Promise<Page<unknown>> {
    const filter: FilterQuery<ProposalDocumentDocument> = {
      organizationId: new Types.ObjectId(organizationId),
    };
    if (!query.includeArchived) filter.archivedAt = null;
    if (query.kind) filter.kind = query.kind;
    if (query.status) filter.status = query.status;
    if (query.customerId) filter.customerId = new Types.ObjectId(query.customerId);
    if (query.templateId) filter.templateId = new Types.ObjectId(query.templateId);
    if (query.assignedToId) filter.assignedToId = new Types.ObjectId(query.assignedToId);
    if (query.search) {
      const pattern = new RegExp(escapeRegex(query.search), 'i');
      filter.$or = [
        { documentNumber: pattern },
        { title: pattern },
        { 'customerSnapshot.name': pattern },
        { 'customerSnapshot.companyName': pattern },
      ];
    }

    const [rows, total] = await Promise.all([
      this.documents
        .find(filter)
        // draftTotals in full: its `lines` map gives the list a priced-line count
        // without shipping the draft itself, which is what the list must never do.
        .select(
          'kind documentNumber title reference status currency locale ' +
            'customerSnapshot.name customerSnapshot.companyName customerSnapshot.customerId ' +
            'templateId templateName currentRevisionNumber validFrom validUntil draftTotals ' +
            'createdAt updatedAt',
        )
        .sort({ createdAt: query.order === 'asc' ? 1 : -1 })
        .skip(query.skip)
        .limit(query.limit)
        .lean(),
      this.documents.countDocuments(filter),
    ]);

    const data = rows.map((row) => {
      const totals = row.draftTotals as { grandTotal?: number; lines?: Record<string, unknown> };
      return {
        id: row._id.toString(),
        documentNumber: row.documentNumber,
        title: row.title,
        reference: row.reference,
        customerName: row.customerSnapshot?.companyName || row.customerSnapshot?.name || '',
        customerId: row.customerSnapshot?.customerId?.toString() ?? null,
        templateId: row.templateId?.toString() ?? null,
        templateName: row.templateName,
        status: this.transitions.effectiveStatus(row.status, row.validUntil),
        grandTotal: totals?.grandTotal ?? 0,
        /** Priced lines only — headings and notes never reach draftTotals.lines. */
        lineCount: Object.keys(totals?.lines ?? {}).length,
        currency: row.currency,
        locale: row.locale,
        revision: row.currentRevisionNumber,
        validFrom: row.validFrom,
        validUntil: row.validUntil,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      };
    });

    return toPage(data, total, query);
  }

  async get(organizationId: string, id: string): Promise<ProposalDocumentDocument> {
    const document = await this.documents.findOne({
      _id: toObjectId(id, ErrorCodes.DOCUMENT_NOT_FOUND, 'Document'),
      organizationId: new Types.ObjectId(organizationId),
    });
    if (!document) {
      throw DomainException.notFound(ErrorCodes.DOCUMENT_NOT_FOUND, 'Document not found.');
    }
    return document;
  }

  async detail(organizationId: string, id: string) {
    const document = await this.get(organizationId, id);
    return {
      ...document.toJSON(),
      status: this.transitions.effectiveStatus(document.status, document.validUntil),
      version: document.__v,
      editable: this.transitions.isEditable(document.status),
    };
  }

  /* ----------------------------------------------------------------- create */

  /**
   * Creates a draft.
   *
   * The template version, customer and company branding are all copied by value
   * here (map.md §29, §70, §71): from this point the document no longer depends
   * on any of them staying unchanged.
   */
  async create(organizationId: string, createdById: string, dto: CreateDocumentDto) {
    const settings = await this.organizations.getSettings(organizationId);
    const organization = await this.organizations.findById(organizationId);
    const now = new Date();

    let templateId: Types.ObjectId | null = null;
    let templateVersionId: Types.ObjectId | null = null;
    let templateName = '';
    let terms = settings.defaultTerms;
    let paymentTerms = settings.defaultPaymentTerms;
    let validityDays = settings.defaultValidityDays;
    let taxInclusive = settings.defaultTaxInclusive;
    let roundOff = settings.defaultRoundOff;
    const defaultTaxRateId = settings.defaultTaxRateId?.toString() ?? null;
    /** Lines the template starts every quotation with, snapshotted by value. */
    let templateLines: DocumentSection['lines'] = [];
    let templatePackageSnapshots: Array<Record<string, unknown>> = [];

    // An unnamed template falls back to the organization's default, so the
    // ordinary case needs no template decision at all. A default that has since
    // been archived is ignored rather than failing the create.
    const requestedTemplateId = dto.templateId ?? settings.defaultTemplateId?.toString();

    if (requestedTemplateId) {
      const resolved = await this.templates
        .requirePublished(organizationId, requestedTemplateId)
        .catch((error: unknown) => {
          if (dto.templateId) throw error;
          return null;
        });

      if (resolved) {
        const { template, version } = resolved;
        templateId = template._id;
        templateVersionId = version._id;
        templateName = template.name;

        const templateSettings = this.validator.parseSettings(version.settingsJson);
        terms = templateSettings.defaultTerms || terms;
        paymentTerms = templateSettings.defaultPaymentTerms || paymentTerms;
        validityDays = templateSettings.defaultValidityDays ?? validityDays;
        taxInclusive = templateSettings.defaultTaxInclusive ?? taxInclusive;
        roundOff = templateSettings.defaultRoundOff ?? roundOff;
        ({ lines: templateLines, packageSnapshots: templatePackageSnapshots } =
          await this.resolveTemplateDefaults(
            organizationId,
            templateSettings.defaultPackages,
            templateSettings.defaultPackageIds,
            version.linesJson,
            defaultTaxRateId,
          ));
      }
    }

    const customerSnapshot = dto.customerId
      ? this.snapshotCustomer(await this.customers.get(organizationId, dto.customerId))
      : {};

    const { number } = await this.numbering.allocate(organization._id, settings, now);

    const document = await this.documents.create({
      organizationId: organization._id,
      kind: dto.kind,
      documentNumber: number,
      title: dto.title ?? templateName,
      reference: dto.reference ?? '',
      customerId: dto.customerId ? new Types.ObjectId(dto.customerId) : null,
      customerSnapshot,
      companySnapshot: {
        name: settings.company.name || organization.name,
        address: settings.company.address,
        phone: settings.company.phone,
        email: settings.company.email,
        website: settings.company.website,
        taxNumber: settings.company.taxNumber,
        bankDetails: settings.company.bankDetails,
        logoUrl: settings.branding.logoUrl ?? organization.logoUrl,
        accentColor: settings.branding.accentColor,
        footerNote: settings.branding.footerNote,
      },
      templateId,
      templateVersionId,
      templateName,
      currency: organization.defaultCurrency,
      locale: organization.locale,
      validFrom: now,
      validUntil: dto.validUntil ? new Date(dto.validUntil) : addDays(now, validityDays),
      draft: {
        answers: dto.answers ? this.parseAnswers(dto.answers) : {},
        sections: [{ id: nextLocalId('sec'), title: 'Items', lines: templateLines }],
        packageSnapshots: templatePackageSnapshots,
        overallDiscount: { mode: 'PERCENT', value: 0 },
        charges: [],
        taxInclusive,
        roundOff,
        terms,
        paymentTerms,
      },
      createdById: new Types.ObjectId(createdById),
    });

    await this.recordEvent(document, 'CREATED', createdById);
    return this.detail(organizationId, document._id.toString());
  }

  /* ------------------------------------------------------------------ write */

  async update(organizationId: string, id: string, userId: string, dto: UpdateDocumentDto) {
    const document = await this.get(organizationId, id);
    this.transitions.assertEditable(document.status);

    // map.md §40 — a stale editor must not silently overwrite a newer save.
    if (dto.expectedVersion !== undefined && dto.expectedVersion !== document.__v) {
      throw DomainException.conflict(
        ErrorCodes.CONCURRENT_EDIT_CONFLICT,
        'Someone else changed this document while you were editing. Reload to see their changes.',
      );
    }

    if (dto.title !== undefined) document.title = dto.title;
    if (dto.reference !== undefined) document.reference = dto.reference;
    if (dto.validUntil !== undefined) document.validUntil = new Date(dto.validUntil);
    if (dto.assignedToId !== undefined) {
      document.assignedToId = new Types.ObjectId(dto.assignedToId);
    }

    /*
     * When to (re-)apply a template.
     *
     * Picking a different one is obvious. The subtler case is picking the same
     * one after publishing new defaults to it: a quotation is pinned to the
     * version it was created with, so without this it kept the old version and
     * the new default items never appeared.
     *
     * Re-pinning is limited to a quotation with no priced lines yet — one nobody
     * has started. A quotation with work in it stays on its version, which is
     * what stops a republished template from moving the ground under an operator
     * mid-edit and overwriting the terms they typed.
     */
    const untouched = !this.hasPricedLines(document);
    const differentTemplate =
      dto.templateId !== undefined && dto.templateId !== document.templateId?.toString();

    if (dto.templateId !== undefined && (differentTemplate || untouched)) {
      const { template, version } = await this.templates.requirePublished(
        organizationId,
        dto.templateId,
      );

      // Same template, already on its current version: an ordinary autosave.
      const stalePin = document.templateVersionId?.toString() !== version._id.toString();

      if (differentTemplate || stalePin) {
        const previousTemplateName = document.templateName;
        const wasUntemplated = !document.templateId;

        document.templateId = template._id;
        document.templateVersionId = version._id;
        document.templateName = template.name;

        if (!document.title || document.title === previousTemplateName) {
          document.title = template.name;
        }

        if (wasUntemplated && this.isDraftEmpty(document)) {
          const templateSettings = this.validator.parseSettings(version.settingsJson);
          if (templateSettings.defaultValidityDays) {
            document.validUntil = addDays(document.validFrom, templateSettings.defaultValidityDays);
          }
          document.draft.terms = templateSettings.defaultTerms || document.draft.terms;
          document.draft.paymentTerms = templateSettings.defaultPaymentTerms || document.draft.paymentTerms;
          document.draft.taxInclusive = templateSettings.defaultTaxInclusive ?? document.draft.taxInclusive;
          document.draft.roundOff = templateSettings.defaultRoundOff ?? document.draft.roundOff;
        }

        /*
         * Seed the template's default lines.
         *
         * Only into a quotation that has no priced lines yet: switching template on a
         * quotation somebody has already built would otherwise wipe or duplicate
         * their work. An empty one is the case where seeding is obviously wanted, and
         * it is what "choose a template and the items appear" means.
         */
        if (!this.hasPricedLines(document)) {
          const orgSettings = await this.organizations.getSettings(organizationId);
          const templateSettings = this.validator.parseSettings(version.settingsJson);
          const seeded = await this.resolveTemplateDefaults(
            organizationId,
            templateSettings.defaultPackages,
            templateSettings.defaultPackageIds,
            version.linesJson,
            orgSettings.defaultTaxRateId?.toString() ?? null,
          );

          const sections = this.parseSections(document.draft.sections);
          const target = sections[0] ?? { id: nextLocalId('sec'), title: 'Items', lines: [] };
          target.lines = seeded.lines;
          if (!sections.includes(target)) sections.push(target);
          document.draft.sections = sections as never;
          document.draft.packageSnapshots = seeded.packageSnapshots as never;
        }
      }
    }

    if (dto.customerId !== undefined) {
      const customer = await this.customers.get(organizationId, dto.customerId);
      document.customerId = customer._id;
      document.customerSnapshot = this.snapshotCustomer(customer) as never;
    }

    if (dto.answers !== undefined) {
      document.draft.answers = this.parseAnswers(dto.answers);
      // A PACKAGE_SELECT answer is a decision about what is being quoted, not a
      // string to print — map.md §16, "when selected during document creation:
      // populate defaults". Runs before totals are recomputed below.
      await this.syncPackagesFromAnswers(organizationId, document);
    }
    if (dto.sections !== undefined) {
      document.draft.sections = this.parseSections(dto.sections) as never;
      document.draft.packageSnapshots = this.reconcilePackageSnapshots(
        document.draft.packageSnapshots,
        document.draft.sections,
      ) as never;
    }
    if (dto.overallDiscount !== undefined) {
      document.draft.overallDiscount = this.parseDiscount(dto.overallDiscount) as never;
    }
    if (dto.charges !== undefined) document.draft.charges = this.parseCharges(dto.charges) as never;
    if (dto.taxInclusive !== undefined) document.draft.taxInclusive = dto.taxInclusive;
    if (dto.roundOff !== undefined) document.draft.roundOff = dto.roundOff;
    if (dto.customerNotes !== undefined) document.draft.customerNotes = dto.customerNotes;
    if (dto.terms !== undefined) document.draft.terms = dto.terms;
    if (dto.paymentTerms !== undefined) document.draft.paymentTerms = dto.paymentTerms;
    if (dto.internalNotes !== undefined) document.draft.internalNotes = dto.internalNotes;

    // Totals are recomputed server-side on every save; a client-sent total is
    // never trusted or stored (map.md §49).
    document.draftTotals = (await this.priceDraft(organizationId, document)) as never;
    await document.save();

    await this.recordEvent(document, 'UPDATED', userId);
    return this.detail(organizationId, id);
  }

  /**
   * Applies every package a PACKAGE_SELECT answer names, and withdraws the ones
   * the answers no longer name — map.md §16.
   *
   * Withdrawal is deliberately conservative. §16 also says a document may
   * override what the package supplied ("Innova → Ertiga"), so a line the user
   * has edited is kept when its package is deselected: only lines that still
   * match the package are removed. A package edited upstream since it was
   * applied therefore reads as "edited" and is also kept, which is the safe
   * direction to be wrong in.
   */
  private async syncPackagesFromAnswers(
    organizationId: string,
    document: ProposalDocumentDocument,
  ): Promise<void> {
    if (!document.templateVersionId) return;

    const version = await this.templates.requireVersion(organizationId, document.templateVersionId);
    const fields = this.validator.parseFieldSchema(version.fieldSchemaJson);
    const packageFields = fields.fields.filter((field) => field.type === 'PACKAGE_SELECT');
    if (!packageFields.length) return;

    const answers = document.draft.answers as Answers;
    const tokens = packageFields
      .flatMap((field) => {
        const raw = answers?.[field.key];
        return Array.isArray(raw) ? raw : [raw];
      })
      .map((value) => String(value ?? '').trim())
      .filter((value) => value !== '');

    const selected = await this.resolvePackageTokens(organizationId, tokens);
    const selectedIds = new Set(selected.map((entry) => entry._id.toString()));
    const snapshots = this.parsePackageSnapshots(document.draft.packageSnapshots);
    const appliedIds = new Set(snapshots.map((snapshot) => snapshot.id));

    const withdrawn = snapshots.filter((snapshot) => !selectedIds.has(snapshot.id));
    const added = selected.filter((entry) => !appliedIds.has(entry._id.toString()));
    if (!withdrawn.length && !added.length) return;

    const settings = await this.organizations.getSettings(organizationId);
    const defaultTaxRateId = settings.defaultTaxRateId?.toString() ?? null;
    let sections = this.parseSections(document.draft.sections);

    for (const snapshot of withdrawn) {
      // eslint-disable-next-line no-await-in-loop
      sections = await this.removeUnmodifiedPackageLines(
        organizationId,
        sections,
        snapshot,
        defaultTaxRateId,
      );
    }

    const nextSnapshots = snapshots.filter(
      (snapshot) => !withdrawn.includes(snapshot) || this.snapshotStillHasLines(snapshot, sections),
    );

    for (const entry of added) {
      const lines = this.resolvePackageLines(entry, defaultTaxRateId);
      sections = this.appendLines(sections, lines);
      nextSnapshots.push(this.snapshotPackage(entry, lines.map((line) => line.id)) as never);
    }

    document.draft.sections = sections as never;
    document.draft.packageSnapshots = this.reconcilePackageSnapshots(nextSnapshots, sections) as never;
  }

  /**
   * A PACKAGE_SELECT option may hold a package id or its display name. Ids are
   * what a picker should store; names are accepted because templates authored
   * before packages were wired list human labels, and those must keep working.
   */
  private async resolvePackageTokens(
    organizationId: string,
    tokens: string[],
  ): Promise<Array<Awaited<ReturnType<PackagesService['get']>>>> {
    const resolved = new Map<string, Awaited<ReturnType<PackagesService['get']>>>();

    for (const token of new Set(tokens)) {
      if (Types.ObjectId.isValid(token)) {
        // eslint-disable-next-line no-await-in-loop
        const entry = await this.packages.get(organizationId, token).catch(() => null);
        if (entry) {
          resolved.set(entry._id.toString(), entry);
          continue;
        }
      }

      // eslint-disable-next-line no-await-in-loop
      const page = await this.packages.list(organizationId, {
        search: token,
        limit: 25,
        skip: 0,
        page: 1,
        includeArchived: false,
      } as never);
      const match = page.data.find(
        (entry) => entry.name.trim().toLowerCase() === token.toLowerCase(),
      );
      // No match is not an error: the answer may legitimately be free text on a
      // template whose options were never bound to real packages.
      if (match) resolved.set(match._id.toString(), match);
    }

    return [...resolved.values()];
  }

  /**
   * Replaces every 'reusableBlock' placeholder with the library block's own
   * blocks — map.md §15, "templates can reference reusable blocks; during
   * generation, RESOLVE them into a snapshot".
   *
   * A placeholder whose library entry is missing, archived or unreadable is
   * dropped rather than failing generation: one stale reference must not make a
   * quotation impossible to issue. The condition authored on the placeholder is
   * inherited by each expanded block, so "show these terms only for interior
   * jobs" keeps working after expansion.
   */
  private async expandReusableBlocks(
    organizationId: string,
    blocks: TemplateBlock[],
  ): Promise<TemplateBlock[]> {
    if (!blocks.some((block) => block.type === 'reusableBlock')) return blocks;

    const expanded: TemplateBlock[] = [];

    for (const block of blocks) {
      if (block.type !== 'reusableBlock') {
        expanded.push(block);
        continue;
      }

      if (!block.refId) continue;

      // eslint-disable-next-line no-await-in-loop
      const entry = await this.blocks.get(organizationId, block.refId).catch(() => null);
      if (!entry || entry.archivedAt) continue;

      const resolved = this.blockResolver.resolve({
        id: entry._id.toString(),
        name: entry.name,
        blockJson: entry.blockJson as Record<string, unknown>,
      });

      expanded.push(
        ...resolved.map((child, index) => ({
          ...child,
          // Block ids must stay unique within a document: two placeholders
          // pointing at the same library entry would otherwise collide.
          id: `${block.id}-${index}`,
          condition: block.condition ?? child.condition,
        })),
      );
    }

    return expanded;
  }

  /**
   * Turns a template's default lines into document lines.
   *
   * Same contract as a package expansion: names, units and rates are copied by
   * value, so editing the template later cannot move a quotation that already
   * used it. Deliberately carries no packageId — these lines belong to the
   * quotation, not to a bundle that can be removed or refreshed as a unit.
   */
  private resolveTemplateLines(
    linesJson: unknown,
    defaultTaxRateId: string | null,
  ): DocumentSection['lines'] {
    const parsed = this.validator.parseTemplateLines(linesJson);

    return parsed.lines
      .filter((line) => line.name.trim() !== '')
      .map((line) => ({
        id: nextLocalId('qln'),
        kind: 'ITEM' as const,
        itemId: line.itemId,
        packageId: null,
        packageName: '',
        name: line.name,
        description: line.description,
        unit: line.unit,
        pricingMode: 'QUANTITY_RATE' as const,
        quantity: line.quantity,
        days: 1,
        rate: line.rate,
        percent: 0,
        formula: '',
        manualAmount: 0,
        taxRateId: line.taxRateId ?? defaultTaxRateId,
        taxPercent: 0,
        discount: { mode: 'PERCENT' as const, value: 0 },
        optional: line.optional,
        selected: true,
      })) as DocumentSection['lines'];
  }

  /**
   * New templates link packages instead of owning priced lines themselves.
   *
   * Existing templates may still carry `linesJson`, so that remains the fallback
   * until they are edited onto the package-linked model.
   */
  private async resolveTemplateDefaults(
    organizationId: string,
    defaultPackages: Array<{
      id: string;
      sourcePackageId: string | null;
      name: string;
      description: string;
      category: string;
      pricingMode: 'SUM_OF_ITEMS' | 'FIXED_PRICE' | 'DISCOUNTED_TOTAL';
      fixedPrice: number;
      discountPercent: number;
      lines: Array<{
        lineId: string;
        itemId: string | null;
        name: string;
        description: string;
        unit: string;
        quantity: number;
        rate: number;
        taxRateId: string | null;
        optional: boolean;
      }>;
    }>,
    defaultPackageIds: string[],
    linesJson: unknown,
    defaultTaxRateId: string | null,
  ): Promise<{ lines: DocumentSection['lines']; packageSnapshots: Array<Record<string, unknown>> }> {
    if (defaultPackages.length) {
      return this.resolveTemplateSnapshotPackages(defaultPackages, defaultTaxRateId);
    }

    const packages = await this.resolveTemplateDefaultPackages(
      organizationId,
      defaultPackageIds,
    );

    if (!packages.length) {
      return {
        lines: this.resolveTemplateLines(linesJson, defaultTaxRateId),
        packageSnapshots: [],
      };
    }

    const lines: DocumentSection['lines'] = [];
    const packageSnapshots: Array<Record<string, unknown>> = [];

    for (const entry of packages) {
      const resolved = this.resolvePackageLines(entry, defaultTaxRateId);
      lines.push(...resolved);
      packageSnapshots.push(this.snapshotPackage(entry, resolved.map((line) => line.id)));
    }

    return { lines, packageSnapshots };
  }

  private resolveTemplateSnapshotPackages(
    entries: Array<{
      id: string;
      sourcePackageId: string | null;
      name: string;
      description: string;
      category: string;
      pricingMode: 'SUM_OF_ITEMS' | 'FIXED_PRICE' | 'DISCOUNTED_TOTAL';
      fixedPrice: number;
      discountPercent: number;
      lines: Array<{
        lineId: string;
        itemId: string | null;
        name: string;
        description: string;
        unit: string;
        quantity: number;
        rate: number;
        taxRateId: string | null;
        optional: boolean;
      }>;
    }>,
    defaultTaxRateId: string | null,
  ): { lines: DocumentSection['lines']; packageSnapshots: Array<Record<string, unknown>> } {
    const lines: DocumentSection['lines'] = [];
    const packageSnapshots: Array<Record<string, unknown>> = [];

    for (const entry of entries) {
      const resolved = this.packageResolver.resolve(
        {
          id: entry.id,
          name: entry.name,
          description: entry.description,
          pricingMode: entry.pricingMode,
          fixedPrice: entry.fixedPrice,
          discountPercent: entry.discountPercent,
          lines: entry.lines.map((line) => ({
            itemId: line.itemId,
            name: line.name,
            description: line.description,
            unit: line.unit,
          quantity: line.quantity,
          rate: line.rate,
          taxRateId: line.taxRateId,
          optional: line.optional,
        })),
        },
        defaultTaxRateId,
      );
      lines.push(...resolved);
      packageSnapshots.push(this.snapshotResolvedPackage(entry, resolved.map((line) => line.id)));
    }

    return { lines, packageSnapshots };
  }

  private async resolveTemplateDefaultPackages(
    organizationId: string,
    defaultPackageIds: string[],
  ): Promise<Array<Awaited<ReturnType<PackagesService['get']>>>> {
    const ordered = uniqueStrings(defaultPackageIds).filter((id) => Types.ObjectId.isValid(id));
    const resolved: Array<Awaited<ReturnType<PackagesService['get']>>> = [];

    for (const id of ordered) {
      // eslint-disable-next-line no-await-in-loop
      const entry = await this.packages.get(organizationId, id).catch(() => null);
      if (entry && !entry.archivedAt) resolved.push(entry);
    }

    return resolved;
  }

  /**
   * The one place a stored package becomes document lines. Both entry points —
   * the item picker's addPackage and a PACKAGE_SELECT answer — go through here so
   * they cannot drift into pricing the same package differently.
   */
  private resolvePackageLines(
    entry: Awaited<ReturnType<PackagesService['get']>>,
    defaultTaxRateId: string | null,
  ): DocumentSection['lines'] {
    return this.packageResolver.resolve(
      {
        id: entry._id.toString(),
        name: entry.name,
        description: entry.description,
        pricingMode: entry.pricingMode,
        fixedPrice: entry.fixedPrice,
        discountPercent: entry.discountPercent,
        lines: entry.lines.map((line) => ({
          itemId: line.itemId?.toString() ?? null,
          name: line.name,
          description: line.description,
          unit: line.unit,
        quantity: line.quantity,
        rate: line.rate,
        taxRateId: line.taxRateId?.toString() ?? null,
        optional: line.optional,
      })),
      },
      defaultTaxRateId,
    );
  }

  /** Drops the deselected package's lines that a user has not edited. */
  private async removeUnmodifiedPackageLines(
    organizationId: string,
    sections: DocumentSection[],
    snapshot: { id: string; lineIds: string[] },
    defaultTaxRateId: string | null,
  ): Promise<DocumentSection[]> {
    const entry = await this.packages.get(organizationId, snapshot.id).catch(() => null);
    // The package itself is gone; its lines are all the document has left of it.
    if (!entry) return sections;

    const pristine = this.resolvePackageLines(entry, defaultTaxRateId);
    const owned = new Set(snapshot.lineIds);

    return sections.map((section) => ({
      ...section,
      lines: section.lines.filter((line) => {
        if (!owned.has(line.id)) return true;
        const original = pristine.find((candidate) => candidate.name === line.name);
        return original ? !this.matchesPackageLine(line, original) : true;
      }),
    }));
  }

  /** Whether a document line still carries exactly what the package supplied. */
  private matchesPackageLine(line: DocumentSection['lines'][number], original: DocumentSection['lines'][number]) {
    return (
      line.unit === original.unit &&
      line.quantity === original.quantity &&
      line.rate === original.rate &&
      line.optional === original.optional &&
      line.discount.mode === original.discount.mode &&
      line.discount.value === original.discount.value &&
      (line.taxRateId ?? null) === (original.taxRateId ?? null)
    );
  }

  private snapshotStillHasLines(
    snapshot: { lineIds: string[] },
    sections: DocumentSection[],
  ): boolean {
    const remaining = new Set(sections.flatMap((section) => section.lines).map((line) => line.id));
    return snapshot.lineIds.some((lineId) => remaining.has(lineId));
  }

  private appendLines(
    sections: DocumentSection[],
    lines: DocumentSection['lines'],
    sectionId?: string,
  ): DocumentSection[] {
    const next = [...sections];
    const index = sectionId ? next.findIndex((section) => section.id === sectionId) : 0;
    const target = index >= 0 ? next[index] : next[0];

    if (!target) {
      next.push({ id: nextLocalId('sec'), title: 'Items', lines: [...lines] } as DocumentSection);
      return next;
    }

    next[next.indexOf(target)] = { ...target, lines: [...target.lines, ...lines] };
    return next;
  }

  /** Expands a package into lines — the snapshot happens here, not at render time. */
  async addPackage(organizationId: string, id: string, userId: string, dto: AddPackageDto) {
    const document = await this.get(organizationId, id);
    this.transitions.assertEditable(document.status);

    const entry = await this.packages.get(organizationId, dto.packageId);
    const settings = await this.organizations.getSettings(organizationId);

    const lines = this.resolvePackageLines(entry, settings.defaultTaxRateId?.toString() ?? null);
    const lineIds = lines.map((line) => line.id);

    document.draft.sections = this.appendLines(
      this.parseSections(document.draft.sections),
      lines,
      dto.sectionId,
    ) as never;
    document.draft.packageSnapshots = [
      ...this.parsePackageSnapshots(document.draft.packageSnapshots),
      this.snapshotPackage(entry, lineIds),
    ] as never;
    document.draftTotals = (await this.priceDraft(organizationId, document)) as never;
    await document.save();

    await this.recordEvent(document, 'UPDATED', userId);
    return this.detail(organizationId, id);
  }

  /** True once the quotation carries at least one line that costs money. */
  private hasPricedLines(document: ProposalDocumentDocument): boolean {
    return this.parseSections(document.draft.sections)
      .flatMap((section) => section.lines)
      .some((line) => line.kind === 'ITEM' || line.kind === 'CUSTOM');
  }

  /**
   * What a document must have before it can reach a customer.
   *
   * Deliberately narrow: it blocks the two states that are always a mistake — no
   * customer to address it to, and no lines to price — and stays out of the way
   * otherwise. A zero-value quotation is legitimate (a goodwill job, a revised
   * scope) so the value itself is not checked.
   *
   * This used to fetch the pinned template version and scan its blocks for a
   * pricing table, because "does this document show prices?" had no other answer.
   * The kind is that answer.
   */
  private assertSendable(document: ProposalDocumentDocument): void {
    if (!document.customerSnapshot?.name && !document.customerSnapshot?.companyName) {
      throw DomainException.invalid(
        ErrorCodes.VALIDATION_FAILED,
        'Add a customer before sending this document.',
      );
    }

    if (document.kind === 'QUOTATION' && !this.hasPricedLines(document)) {
      throw DomainException.invalid(
        ErrorCodes.VALIDATION_FAILED,
        'This quotation has no items in it. Add an item before sending.',
      );
    }
  }

  /* --------------------------------------------------------------- generate */

  /**
   * Compiles the draft into a revision — the twelve steps of map.md §29.
   *
   * While the current revision has never been sent it is recompiled in place, so
   * repeated previews do not litter the history. Once sent it is frozen and the
   * caller must ask for a new revision instead.
   */
  async generate(organizationId: string, id: string, userId: string) {
    const document = await this.get(organizationId, id);
    const compiled = await this.compile(organizationId, document);

    const current = document.currentRevisionId
      ? await this.revisions.findById(document.currentRevisionId)
      : null;

    if (current?.sentAt) {
      throw DomainException.invalid(
        ErrorCodes.DOCUMENT_REVISION_IMMUTABLE,
        'This revision has already been shared. Create a new revision to make changes.',
      );
    }

    const previous = await this.previousRevision(document, current?.revisionNumber ?? null);
    const payload = {
      documentId: document._id,
      organizationId: document.organizationId,
      revisionNumber: current?.revisionNumber ?? 1,
      templateVersionId: document.templateVersionId,
      inputValuesJson: document.draft.answers,
      resolvedDocumentJson: compiled as unknown as Record<string, unknown>,
      styleSnapshotJson: compiled.style as unknown as Record<string, unknown>,
      ...this.revisionPricing(compiled),
      createdById: new Types.ObjectId(userId),
    };

    const changeSummary = this.diffs.compare(
      previous,
      { ...payload, ...payload.pricingSnapshotJson.totals },
      document.currency,
      document.locale,
    );

    const revision = current
      ? await this.revisions.findByIdAndUpdate(
          current._id,
          { $set: { ...payload, changeSummaryJson: changeSummary } },
          { new: true },
        )
      : await this.revisions.create({ ...payload, changeSummaryJson: changeSummary });

    if (!revision) {
      throw DomainException.notFound(
        ErrorCodes.DOCUMENT_REVISION_NOT_FOUND,
        'Revision not found.',
      );
    }

    document.currentRevisionId = revision._id;
    document.currentRevisionNumber = revision.revisionNumber;
    document.draftTotals = payload.pricingSnapshotJson.totals as never;
    await document.save();

    await this.recordEvent(document, 'GENERATED', userId, revision._id);
    return revision.toJSON();
  }

  /** map.md §26 — a new revision never overwrites the one the customer received. */
  async createRevision(organizationId: string, id: string, userId: string, dto: CreateRevisionDto) {
    const document = await this.get(organizationId, id);

    if (document.status === 'ACCEPTED') {
      throw DomainException.invalid(
        ErrorCodes.DOCUMENT_ALREADY_ACCEPTED,
        'This document has been accepted. Duplicate it instead of revising it.',
      );
    }
    if (!document.currentRevisionId) {
      throw DomainException.invalid(
        ErrorCodes.DOCUMENT_NOT_GENERATED,
        'Generate this document before creating a revision.',
      );
    }

    const compiled = await this.compile(organizationId, document);
    const previous = await this.revisions.findById(document.currentRevisionId).lean();
    const pricing = this.revisionPricing(compiled);

    const payload = {
      documentId: document._id,
      organizationId: document.organizationId,
      revisionNumber: document.currentRevisionNumber + 1,
      templateVersionId: document.templateVersionId,
      inputValuesJson: document.draft.answers,
      resolvedDocumentJson: compiled as unknown as Record<string, unknown>,
      styleSnapshotJson: compiled.style as unknown as Record<string, unknown>,
      ...pricing,
      createdById: new Types.ObjectId(userId),
    };

    const revision = await this.revisions.create({
      ...payload,
      changeSummaryJson: {
        reason: dto.reason ?? '',
        ...this.diffs.compare(
          previous,
          { ...payload, ...payload.pricingSnapshotJson.totals },
          document.currency,
          document.locale,
        ),
      },
    });

    document.currentRevisionId = revision._id;
    document.currentRevisionNumber = revision.revisionNumber;
    document.status = 'DRAFT';
    document.draftTotals = payload.pricingSnapshotJson.totals as never;
    await document.save();

    await this.recordEvent(document, 'REVISION_CREATED', userId, revision._id);
    return revision.toJSON();
  }

  listRevisions(organizationId: string, id: string) {
    return this.revisions
      .find({
        documentId: toObjectId(id, ErrorCodes.DOCUMENT_NOT_FOUND, 'Document'),
        organizationId: new Types.ObjectId(organizationId),
      })
      .select('revisionNumber subtotal discountTotal taxTotal grandTotal changeSummaryJson sentAt createdAt createdById')
      .sort({ revisionNumber: -1 })
      .lean();
  }

  async getRevision(organizationId: string, id: string, revisionId: string) {
    const revision = await this.revisions.findOne({
      _id: toObjectId(revisionId, ErrorCodes.DOCUMENT_REVISION_NOT_FOUND, 'Revision'),
      documentId: toObjectId(id, ErrorCodes.DOCUMENT_NOT_FOUND, 'Document'),
      organizationId: new Types.ObjectId(organizationId),
    });
    if (!revision) {
      throw DomainException.notFound(ErrorCodes.DOCUMENT_REVISION_NOT_FOUND, 'Revision not found.');
    }
    return revision;
  }

  /* ------------------------------------------------------------- lifecycle */

  async requestApproval(organizationId: string, id: string, userId: string) {
    return this.transition(organizationId, id, userId, 'PENDING_APPROVAL', 'APPROVAL_REQUESTED');
  }

  async approve(organizationId: string, id: string, userId: string) {
    const document = await this.get(organizationId, id);
    this.transitions.assertCanTransition(document.status, 'APPROVED');

    document.status = 'APPROVED';
    document.approvedAt = new Date();
    document.approvedById = new Types.ObjectId(userId);
    await document.save();

    await this.recordEvent(document, 'APPROVED', userId);
    return this.detail(organizationId, id);
  }

  /**
   * Freezes the current revision, mints a share link and marks the document sent.
   *
   * Usage counters are bumped here rather than at creation so "most used" tracks
   * what actually reached a customer.
   */
  async send(organizationId: string, id: string, userId: string, dto: SendDocumentDto) {
    const document = await this.get(organizationId, id);
    const settings = await this.organizations.getSettings(organizationId);

    if (settings.requireApprovalBeforeSend && document.status === 'DRAFT') {
      throw DomainException.invalid(
        ErrorCodes.APPROVAL_REQUIRED,
        'This organization requires approval before a document can be sent.',
      );
    }
    this.transitions.assertCanTransition(document.status, 'SENT');
    this.assertSendable(document);

    if (!document.currentRevisionId) await this.generate(organizationId, id, userId);
    const fresh = await this.get(organizationId, id);
    const revision = await this.revisions.findById(fresh.currentRevisionId);
    if (!revision) {
      throw DomainException.invalid(
        ErrorCodes.DOCUMENT_NOT_GENERATED,
        'Generate this document before sending it.',
      );
    }

    if (!revision.sentAt) {
      revision.sentAt = new Date();
      await revision.save();
    }

    const token = generateShareToken();
    const validityDays = dto.shareValidityDays || settings.shareLinkValidityDays;

    fresh.share = {
      tokenHash: hashToken(token),
      createdAt: new Date(),
      expiresAt: validityDays > 0 ? addDays(new Date(), validityDays) : null,
      revokedAt: null,
      viewCount: 0,
      lastViewedAt: null,
    } as never;
    fresh.status = 'SENT';
    fresh.sentAt = new Date();
    await fresh.save();

    await this.recordUsage(organizationId, fresh);
    await this.recordEvent(fresh, 'SENT', userId, revision._id);
    await this.recordEvent(fresh, 'SHARE_LINK_CREATED', userId);

    // The raw token is returned exactly once — only its hash is stored.
    return { shareToken: token, expiresAt: fresh.share.expiresAt, status: fresh.status };
  }

  async revokeShareLink(organizationId: string, id: string, userId: string) {
    const document = await this.get(organizationId, id);
    document.share.revokedAt = new Date();
    await document.save();
    await this.recordEvent(document, 'SHARE_LINK_REVOKED', userId);
    return { revoked: true };
  }

  async archive(organizationId: string, id: string, userId: string) {
    const document = await this.get(organizationId, id);
    this.transitions.assertCanTransition(document.status, 'CANCELLED');
    document.status = 'CANCELLED';
    document.archivedAt = new Date();
    await document.save();
    await this.recordEvent(document, 'CANCELLED', userId);
    return this.detail(organizationId, id);
  }

  timeline(organizationId: string, id: string) {
    return this.events
      .find({
        documentId: toObjectId(id, ErrorCodes.DOCUMENT_NOT_FOUND, 'Document'),
        organizationId: new Types.ObjectId(organizationId),
      })
      .sort({ createdAt: -1 })
      .limit(200)
      .lean();
  }

  /* -------------------------------------------------------------- rendering */

  async preview(organizationId: string, id: string): Promise<string> {
    const document = await this.get(organizationId, id);
    const compiled = await this.compile(organizationId, document);
    return this.html.render(compiled);
  }

  async renderRevision(organizationId: string, id: string, revisionId: string): Promise<string> {
    const revision = await this.getRevision(organizationId, id, revisionId);
    return this.html.render(revision.resolvedDocumentJson as unknown as CompiledDocument);
  }

  async pdfForCurrentRevision(organizationId: string, id: string) {
    const document = await this.get(organizationId, id);
    if (!document.currentRevisionId) {
      throw DomainException.invalid(
        ErrorCodes.DOCUMENT_NOT_GENERATED,
        'Generate this document before downloading a PDF.',
      );
    }
    const revision = await this.revisions.findById(document.currentRevisionId);
    if (!revision) {
      throw DomainException.notFound(ErrorCodes.DOCUMENT_REVISION_NOT_FOUND, 'Revision not found.');
    }
    return this.pdf.generate(revision.resolvedDocumentJson as unknown as CompiledDocument);
  }

  /* --------------------------------------------------------------- internals */

  /** Runs the full compile for the *current draft*, by kind. */
  private async compile(
    organizationId: string,
    document: ProposalDocumentDocument,
  ): Promise<CompiledDocument> {
    const meta = this.compileMeta(document);

    if (document.kind === 'QUOTATION') {
      return this.compiler.compile({
        kind: 'QUOTATION',
        style: this.validator.parseStyleSchema(undefined),
        sections: this.parseSections(document.draft.sections),
        taxRates: await this.catalog.taxSnapshots(organizationId),
        overallDiscount: this.parseDiscount(document.draft.overallDiscount),
        charges: this.parseCharges(document.draft.charges),
        taxInclusive: document.draft.taxInclusive,
        roundOff: document.draft.roundOff,
        meta,
      });
    }

    const version = document.templateVersionId
      ? await this.templates.requireVersion(organizationId, document.templateVersionId)
      : null;

    const parsedSchema = this.validator.parseDocumentSchema(version?.schemaJson);
    const fields = this.validator.parseFieldSchema(version?.fieldSchemaJson);
    const style = this.validator.parseStyleSchema(version?.styleSchemaJson);
    const answers = document.draft.answers as Answers;

    // Library blocks become a by-value snapshot here, before anything is
    // rendered or stored on a revision — map.md §15. Nothing downstream sees a
    // 'reusableBlock' placeholder or reads the library again.
    const schema = {
      ...parsedSchema,
      blocks: await this.expandReusableBlocks(organizationId, parsedSchema.blocks),
    };

    // Required answers are enforced at generation, not on every autosave.
    this.variables.assertAnswersValid(fields, answers);

    return this.compiler.compile({
      kind: 'PROPOSAL',
      schema,
      fields,
      style,
      answers,
      // Read from the pinned version, so a proposal prints the body that was
      // published when it was created — not whatever the template says today.
      documentHtml: version?.documentHtml ?? '',
      meta,
    });
  }

  /** The letterhead, parties and closing content, identical for both kinds. */
  private compileMeta(document: ProposalDocumentDocument): CompileMeta {
    return {
      documentNumber: document.documentNumber,
      documentDate: document.validFrom,
      validUntil: document.validUntil,
      currency: document.currency,
      locale: document.locale,
      title: document.title,
      reference: document.reference,
      customer: {
        name: document.customerSnapshot.name,
        companyName: document.customerSnapshot.companyName,
        email: document.customerSnapshot.email,
        phone: document.customerSnapshot.phone,
        billingAddress: document.customerSnapshot.billingAddress,
      },
      company: {
        name: document.companySnapshot.name,
        address: document.companySnapshot.address,
        phone: document.companySnapshot.phone,
        email: document.companySnapshot.email,
        website: document.companySnapshot.website,
        taxNumber: document.companySnapshot.taxNumber,
        logoUrl: document.companySnapshot.logoUrl,
        accentColor: document.companySnapshot.accentColor,
      },
      terms: document.draft.terms,
      paymentTerms: document.draft.paymentTerms,
      customerNotes: document.draft.customerNotes,
    };
  }

  /**
   * The priced half of a revision payload, or its absence.
   *
   * A proposal has no totals to freeze, so it writes an empty snapshot and leaves
   * the four denormalised columns at the schema's zero default. Anything reading a
   * proposal revision must therefore check `kind` rather than trusting a 0 to mean
   * "free" — `publicPayload` is the one that matters, and it returns null.
   */
  private revisionPricing(compiled: CompiledDocument) {
    if (compiled.kind === 'PROPOSAL') {
      return {
        pricingSnapshotJson: { sections: [], totals: emptyTotals(), taxInclusive: false },
        subtotal: 0,
        discountTotal: 0,
        taxTotal: 0,
        grandTotal: 0,
      };
    }

    const totals = compiled.pricing.totals;
    return {
      pricingSnapshotJson: {
        sections: compiled.pricing.sections,
        totals,
        taxInclusive: compiled.pricing.taxInclusive,
      },
      subtotal: totals.subtotal,
      discountTotal: totals.discountTotal,
      taxTotal: totals.taxTotal,
      grandTotal: totals.grandTotal,
    };
  }

  /** Totals for the draft, without requiring answers to be complete yet. */
  private async priceDraft(organizationId: string, document: ProposalDocumentDocument) {
    return this.pricing.calculate({
      sections: this.parseSections(document.draft.sections),
      taxRates: await this.catalog.taxSnapshots(organizationId),
      overallDiscount: this.parseDiscount(document.draft.overallDiscount),
      charges: this.parseCharges(document.draft.charges),
      taxInclusive: document.draft.taxInclusive,
      roundOff: document.draft.roundOff,
    });
  }

  private async previousRevision(document: ProposalDocumentDocument, currentNumber: number | null) {
    if (!currentNumber || currentNumber <= 1) return null;
    const previous = await this.revisions
      .findOne({ documentId: document._id, revisionNumber: currentNumber - 1 })
      .lean();
    return previous ?? null;
  }

  private async transition(
    organizationId: string,
    id: string,
    userId: string,
    status: DocumentStatus,
    event: DocumentEventType,
  ) {
    const document = await this.get(organizationId, id);
    this.transitions.assertCanTransition(document.status, status);
    document.status = status;
    await document.save();
    await this.recordEvent(document, event, userId);
    return this.detail(organizationId, id);
  }

  private async recordUsage(organizationId: string, document: ProposalDocumentDocument) {
    const sections = this.parseSections(document.draft.sections);
    const lines = sections.flatMap((section) => section.lines);

    const itemIds = unique(lines.map((line) => line.itemId));
    const packageIds = unique(lines.map((line) => line.packageId));

    await Promise.all([
      this.catalog.recordItemUsage(organizationId, itemIds),
      this.packages.recordUsage(organizationId, packageIds),
      this.templates.recordUsage(organizationId, document.templateId),
    ]);
  }

  async recordEvent(
    document: ProposalDocumentDocument,
    eventType: DocumentEventType,
    actorUserId: string | null,
    revisionId: Types.ObjectId | null = null,
    metadata: Record<string, unknown> = {},
  ): Promise<void> {
    await this.events.create({
      organizationId: document.organizationId,
      documentId: document._id,
      revisionId,
      eventType,
      actorUserId: actorUserId ? new Types.ObjectId(actorUserId) : null,
      metadata,
    });
  }

  private snapshotCustomer(customer: {
    _id: Types.ObjectId;
    name: string;
    companyName: string;
    email: string;
    phone: string;
    taxId: string;
    billingAddress: { line1: string; line2: string; city: string; state: string; postalCode: string; country: string };
  }) {
    return {
      customerId: customer._id,
      name: customer.name,
      companyName: customer.companyName,
      email: customer.email,
      phone: customer.phone,
      taxId: customer.taxId,
      billingAddress: [
        customer.billingAddress.line1,
        customer.billingAddress.line2,
        customer.billingAddress.city,
        customer.billingAddress.state,
        customer.billingAddress.postalCode,
        customer.billingAddress.country,
      ]
        .filter(Boolean)
        .join(', '),
    };
  }

  /* JSON coming from a client is parsed, never trusted — map.md §45. */

  private parseAnswers(input: unknown): Answers {
    const result = answersSchema.safeParse(input);
    if (!result.success) {
      throw DomainException.invalid(
        ErrorCodes.VALIDATION_FAILED,
        'Invalid answers payload.',
        formatZodError(result.error),
      );
    }
    return result.data as Answers;
  }

  private parseSections(input: unknown): DocumentSection[] {
    const result = sectionsSchema.safeParse(input ?? []);
    if (!result.success) {
      throw DomainException.invalid(
        ErrorCodes.VALIDATION_FAILED,
        'Invalid pricing sections.',
        formatZodError(result.error),
      );
    }
    return result.data as DocumentSection[];
  }

  private parsePackageSnapshots(input: unknown) {
    if (!Array.isArray(input)) return [];

    return input
      .map((entry) => {
        if (!entry || typeof entry !== 'object') return null;
        const snapshot = entry as Record<string, unknown>;
        const packageId =
          snapshot.packageId instanceof Types.ObjectId
            ? snapshot.packageId.toString()
            : typeof snapshot.packageId === 'string'
              ? snapshot.packageId
              : null;
        if (!packageId) return null;

        return {
          id: packageId,
          name: typeof snapshot.name === 'string' ? snapshot.name : '',
          description: typeof snapshot.description === 'string' ? snapshot.description : '',
          lineIds: Array.isArray(snapshot.lineIds) ? snapshot.lineIds.map((lineId) => String(lineId)) : [],
        };
      })
      .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));
  }

  private reconcilePackageSnapshots(input: unknown, rawSections: unknown) {
    const snapshots = this.parsePackageSnapshots(input);
    if (!snapshots.length) return [];

    const remainingLineIds = new Set(
      this.parseSections(rawSections)
        .flatMap((section) => section.lines)
        .map((line) => line.id),
    );

    return snapshots.filter((snapshot) => snapshot.lineIds.some((lineId) => remainingLineIds.has(lineId)));
  }

  private parseDiscount(input: unknown): Discount {
    const result = discountSchema.safeParse(input ?? { mode: 'PERCENT', value: 0 });
    if (!result.success) {
      throw DomainException.invalid(
        ErrorCodes.VALIDATION_FAILED,
        'Invalid discount.',
        formatZodError(result.error),
      );
    }
    return result.data;
  }

  private parseCharges(input: unknown): ExtraCharge[] {
    const result = chargesSchema.safeParse(input ?? []);
    if (!result.success) {
      throw DomainException.invalid(
        ErrorCodes.VALIDATION_FAILED,
        'Invalid extra charges.',
        formatZodError(result.error),
      );
    }
    return result.data;
  }

  private isDraftEmpty(document: ProposalDocumentDocument) {
    const sections = this.parseSections(document.draft.sections);
    return (
      Object.keys((document.draft.answers as Record<string, unknown>) ?? {}).length === 0 &&
      sections.every((section) => section.lines.length === 0) &&
      !document.reference &&
      !document.draft.customerNotes &&
      !document.draft.paymentTerms &&
      !document.draft.terms &&
      !document.draft.internalNotes
    );
  }

  private snapshotPackage(
    entry: Awaited<ReturnType<PackagesService['get']>>,
    lineIds: string[],
  ) {
    return this.snapshotResolvedPackage(
      {
        id: entry._id.toString(),
        name: entry.name,
        description: entry.description,
      },
      lineIds,
    );
  }

  private snapshotResolvedPackage(
    entry: {
      id: string;
      name: string;
      description: string;
    },
    lineIds: string[],
  ) {
    return {
      packageId: entry.id,
      name: entry.name,
      description: entry.description,
      lineIds,
    };
  }
}

function addDays(date: Date, days: number): Date {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

function unique(values: Array<string | null | undefined>): Types.ObjectId[] {
  const seen = new Set(values.filter((value): value is string => Boolean(value)));
  return [...seen]
    .filter((value) => Types.ObjectId.isValid(value))
    .map((value) => new Types.ObjectId(value));
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.filter((value) => value.trim() !== ''))];
}
