import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, Model, Types } from 'mongoose';

import { BusinessCategoriesService } from 'src/business-categories/business-categories.service';
import { Page, escapeRegex, toPage } from 'src/common/dto/pagination.dto';
import { DomainException } from 'src/common/errors/domain.exception';
import { ErrorCodes } from 'src/common/errors/error-codes';
import { toObjectId } from 'src/common/utils/ids';
import { OrganizationsService } from 'src/organizations/organizations.service';
import { HtmlRendererService } from 'src/rendering/html-renderer.service';
import {
  documentBodyUsesItemTable,
  sanitiseDocumentBody,
} from 'src/template-engine/document-body';
import { DocumentCompiler } from 'src/template-engine/document.compiler';
import { DocumentSection } from 'src/template-engine/pricing.types';
import { TemplateSchemaValidator, ValidationReport } from 'src/template-engine/template-schema.validator';
import {
  CreateTemplateDto,
  PublishTemplateDto,
  TemplateQuery,
  UpdateTemplateDto,
} from './dto/template.dto';
import { TemplateVersion, TemplateVersionDocument } from './template-version.schema';
import { Template, TemplateDocument } from './template.schema';

@Injectable()
export class TemplatesService {
  constructor(
    @InjectModel(Template.name) private readonly templates: Model<TemplateDocument>,
    @InjectModel(TemplateVersion.name)
    private readonly versions: Model<TemplateVersionDocument>,
    private readonly validator: TemplateSchemaValidator,
    private readonly organizations: OrganizationsService,
    private readonly businessCategories: BusinessCategoriesService,
    private readonly compiler: DocumentCompiler,
    private readonly html: HtmlRendererService,
  ) {}

  async list(organizationId: string, query: TemplateQuery): Promise<Page<unknown>> {
    await this.consolidateDraftTemplates(organizationId);
    const organization = await this.organizations.findById(organizationId);
    const filters: FilterQuery<TemplateDocument>[] = [
      { organizationId: new Types.ObjectId(organizationId) },
    ];
    if (organization.primaryBusinessCategoryId) {
      filters.push({
        $or: [
          { businessCategoryId: organization.primaryBusinessCategoryId },
          { businessCategoryId: null },
        ],
      });
    }
    if (!query.includeArchived) filters.push({ archivedAt: null });
    if (query.status) filters.push({ status: query.status });
    if (query.industry) filters.push({ industry: query.industry });
    if (query.category) filters.push({ category: query.category });
    if (query.search) {
      const pattern = new RegExp(escapeRegex(query.search), 'i');
      filters.push({
        $or: [{ name: pattern }, { description: pattern }, { industry: pattern }],
      });
    }
    const filter = filters.length === 1 ? filters[0] : { $and: filters };

    // List DTO: metadata only, never the schema JSON — map.md §83, §84.
    const [data, total] = await Promise.all([
      this.templates
        .find(filter)
        .sort({ updatedAt: query.order === 'asc' ? 1 : -1 })
        .skip(query.skip)
        .limit(query.limit)
        .lean(),
      this.templates.countDocuments(filter),
    ]);

    const categoriesById = await this.businessCategories.mapByIds(
      data.map((template) => template.businessCategoryId),
    );

    return toPage(
      data.map((template) => this.serializeTemplate(template, categoriesById)),
      total,
      query,
    );
  }

  async get(organizationId: string, id: string): Promise<TemplateDocument> {
    const template = await this.templates.findOne({
      _id: toObjectId(id, ErrorCodes.TEMPLATE_NOT_FOUND, 'Template'),
      organizationId: new Types.ObjectId(organizationId),
    });
    if (!template) {
      throw DomainException.notFound(ErrorCodes.TEMPLATE_NOT_FOUND, 'Template not found.');
    }
    return template;
  }

  /** Detail view: the template plus its editable draft version. */
  async detail(organizationId: string, id: string) {
    const template = await this.get(organizationId, id);
    const draft = await this.currentDraftVersion(template);
    const active = template.activeVersionId
      ? await this.versions.findById(template.activeVersionId).lean()
      : null;
    const categoriesById = await this.businessCategories.mapByIds([
      template.businessCategoryId,
    ]);

    return {
      template: this.serializeTemplate(template, categoriesById),
      draft: draft ? draft.toJSON() : null,
      activeVersion: active,
    };
  }

  async preview(organizationId: string, id: string): Promise<string> {
    const template = await this.get(organizationId, id);
    const version =
      (await this.currentDraftVersion(template)) ??
      (template.activeVersionId
        ? await this.versions.findById(template.activeVersionId)
        : null);
    const organization = await this.organizations.findById(organizationId);
    const settings = await this.organizations.getSettings(organizationId);

    const schema = this.validator.parseDocumentSchema(version?.schemaJson);
    const fields = this.validator.parseFieldSchema(version?.fieldSchemaJson);
    const style = this.validator.parseStyleSchema(version?.styleSchemaJson);
    const templateSettings = this.validator.parseSettings(version?.settingsJson);
    const documentDate = new Date();
    const defaultValidityDays =
      templateSettings.defaultValidityDays ?? settings.defaultValidityDays ?? 15;
    const validUntil = new Date(documentDate);
    validUntil.setDate(validUntil.getDate() + defaultValidityDays);

    const compiled = this.compiler.compile({
      schema,
      fields,
      style,
      answers: this.previewAnswers(fields.fields),
      packages: this.previewPackages(schema.blocks, templateSettings.defaultPackages),
      documentHtml: version?.documentHtml ?? '',
      sections: this.previewSections(schema.blocks, version?.documentHtml ?? ''),
      taxRates: [],
      overallDiscount: { mode: 'PERCENT', value: 0 },
      charges: [],
      taxInclusive: templateSettings.defaultTaxInclusive ?? settings.defaultTaxInclusive,
      roundOff: templateSettings.defaultRoundOff ?? settings.defaultRoundOff,
      meta: {
        documentNumber: 'TEMPLATE-PREVIEW',
        documentDate,
        validUntil,
        currency: organization.defaultCurrency,
        locale: organization.locale,
        customer: {
          name: 'Alex Morgan',
          companyName: 'Sample Customer',
          email: 'alex@example.com',
          phone: '+91 98765 43210',
          billingAddress: '42 Sample Street, Demo City',
        },
        title: template.name,
        company: {
          name: settings.company.name || organization.name,
          address: settings.company.address,
          phone: settings.company.phone,
          email: settings.company.email,
          website: settings.company.website,
          taxNumber: settings.company.taxNumber,
          logoUrl: settings.branding.logoUrl ?? organization.logoUrl,
          accentColor: settings.branding.accentColor,
        },
        terms: templateSettings.defaultTerms || settings.defaultTerms,
        paymentTerms:
          templateSettings.defaultPaymentTerms || settings.defaultPaymentTerms,
        customerNotes: 'Preview generated with sample data.',
      },
    });

    return this.html.render(compiled);
  }

  async create(organizationId: string, createdById: string, dto: CreateTemplateDto) {
    const organization = await this.organizations.findById(organizationId);
    const businessCategoryId = dto.businessCategoryId
      ? (await this.businessCategories.require(dto.businessCategoryId))._id
      : organization.primaryBusinessCategoryId;
    const { template, draft } = await this.upsertSingletonDraftTemplate(
      organizationId,
      createdById,
      {
        name: dto.name,
        description: dto.description ?? '',
        category: dto.category ?? 'General',
        industry: dto.industry ?? '',
        businessCategoryId: businessCategoryId ?? null,
      },
      {
        schemaJson: this.validator.parseDocumentSchema(dto.draft?.schemaJson),
        fieldSchemaJson: this.validator.parseFieldSchema(dto.draft?.fieldSchemaJson),
        styleSchemaJson: this.validator.parseStyleSchema(dto.draft?.styleSchemaJson),
        linesJson: this.validator.parseTemplateLines(dto.draft?.linesJson),
        settingsJson: this.validator.parseSettings(dto.draft?.settingsJson),
        documentHtml: sanitiseDocumentBody(dto.draft?.documentHtml ?? ''),
      },
    );

    const categoriesById = await this.businessCategories.mapByIds([
      template.businessCategoryId,
    ]);
    return { template: this.serializeTemplate(template, categoriesById), draft: draft.toJSON() };
  }

  async update(organizationId: string, id: string, dto: UpdateTemplateDto) {
    const template = await this.get(organizationId, id);
    if (dto.businessCategoryId !== undefined) {
      template.businessCategoryId = dto.businessCategoryId
        ? (await this.businessCategories.require(dto.businessCategoryId))._id
        : null;
    }
    template.set({
      ...dto,
      businessCategoryId: undefined,
    });
    await template.save();
    const categoriesById = await this.businessCategories.mapByIds([
      template.businessCategoryId,
    ]);
    return this.serializeTemplate(template, categoriesById);
  }

  /* --------------------------------------------------------------- versions */

  /**
   * Returns the editable draft, creating one if the template only has published
   * versions. This is the rule from map.md §8: editing a published template
   * starts a new draft rather than mutating history.
   */
  async draftVersion(template: TemplateDocument): Promise<TemplateVersionDocument> {
    const existing = await this.currentDraftVersion(template);
    if (existing) return existing;

    const source = template.activeVersionId
      ? await this.versions.findById(template.activeVersionId)
      : null;
    const latest = await this.versions
      .findOne({ templateId: template._id })
      .sort({ versionNumber: -1 })
      .lean();

    const draft = await this.versions.create({
      templateId: template._id,
      organizationId: template.organizationId,
      versionNumber: (latest?.versionNumber ?? 0) + 1,
      schemaJson: source?.schemaJson ?? this.validator.parseDocumentSchema(undefined),
      fieldSchemaJson: source?.fieldSchemaJson ?? this.validator.parseFieldSchema(undefined),
      styleSchemaJson: source?.styleSchemaJson ?? this.validator.parseStyleSchema(undefined),
      settingsJson: source?.settingsJson ?? this.validator.parseSettings(undefined),
      // Carried over like everything else: omitting it meant a publish followed by
      // an edit silently discarded the template's default line items.
      linesJson: source?.linesJson ?? this.validator.parseTemplateLines(undefined),
      // Carried over for the same reason as linesJson: dropping it here would
      // silently blank a document-authored template on its first edit after publish.
      documentHtml: source?.documentHtml ?? '',
      createdById: template.createdById,
    });

    template.draftVersionId = draft._id;
    await template.save();
    return draft;
  }

  async updateDraft(
    organizationId: string,
    id: string,
    patch: {
      schemaJson?: unknown;
      fieldSchemaJson?: unknown;
      styleSchemaJson?: unknown;
      settingsJson?: unknown;
      linesJson?: unknown;
      documentHtml?: string;
    },
  ) {
    const template = await this.get(organizationId, id);
    const draft = await this.draftVersion(template);

    if (draft.publishedAt) {
      throw DomainException.invalid(
        ErrorCodes.TEMPLATE_VERSION_IMMUTABLE,
        'This version is published and cannot be edited. Create a new draft instead.',
      );
    }

    if (patch.schemaJson !== undefined) {
      draft.schemaJson = this.validator.parseDocumentSchema(patch.schemaJson);
    }
    if (patch.fieldSchemaJson !== undefined) {
      draft.fieldSchemaJson = this.validator.parseFieldSchema(patch.fieldSchemaJson);
    }
    if (patch.linesJson !== undefined) {
      draft.linesJson = this.validator.parseTemplateLines(patch.linesJson);
    }
    if (patch.styleSchemaJson !== undefined) {
      draft.styleSchemaJson = this.validator.parseStyleSchema(patch.styleSchemaJson);
    }
    if (patch.settingsJson !== undefined) {
      draft.settingsJson = this.validator.parseSettings(patch.settingsJson);
    }
    // Sanitised on the way in, not only on the way out: the stored body is read
    // by other code paths, and an endpoint is reachable without the editor.
    if (patch.documentHtml !== undefined) {
      draft.documentHtml = sanitiseDocumentBody(patch.documentHtml);
    }

    await draft.save();
    return draft;
  }

  async validate(organizationId: string, id: string): Promise<ValidationReport> {
    const template = await this.get(organizationId, id);
    const version =
      (await this.currentDraftVersion(template)) ??
      (template.activeVersionId
        ? await this.versions.findById(template.activeVersionId)
        : null);
    return this.validator.validate(
      this.validator.parseDocumentSchema(version?.schemaJson),
      this.validator.parseFieldSchema(version?.fieldSchemaJson),
      version?.documentHtml,
    );
  }

  /**
   * Freezes the draft and points the template at it.
   *
   * Documents created before this call keep referencing the previous version id,
   * so their output cannot change — map.md §116.
   */
  async publish(organizationId: string, id: string, dto: PublishTemplateDto) {
    const template = await this.get(organizationId, id);
    const draft = await this.draftVersion(template);

    this.validator.assertPublishable(
      this.validator.parseDocumentSchema(draft.schemaJson),
      this.validator.parseFieldSchema(draft.fieldSchemaJson),
      draft.documentHtml,
    );

    draft.publishedAt = new Date();
    draft.changeNote = dto.changeNote ?? '';
    await draft.save();

    template.activeVersionId = draft._id;
    template.draftVersionId = null;
    template.status = 'PUBLISHED';
    await template.save();

    const categoriesById = await this.businessCategories.mapByIds([
      template.businessCategoryId,
    ]);
    return { template: this.serializeTemplate(template, categoriesById), version: draft.toJSON() };
  }

  async listVersions(organizationId: string, id: string) {
    const template = await this.get(organizationId, id);
    await this.currentDraftVersion(template);
    return this.versions
      .find({ templateId: template._id })
      .sort({ versionNumber: -1 })
      // Metadata only; the caller asks for a specific version to get its JSON.
      .select('versionNumber changeNote publishedAt createdById createdAt')
      .lean();
  }

  async getVersion(organizationId: string, id: string, versionNumber: number) {
    const template = await this.get(organizationId, id);
    const version = await this.versions
      .findOne({ templateId: template._id, versionNumber })
      .lean();
    if (!version) {
      throw DomainException.notFound(
        ErrorCodes.TEMPLATE_VERSION_NOT_FOUND,
        'Template version not found.',
      );
    }
    return version;
  }

  /** Loads the exact version a document must be built from — map.md §29. */
  async requireVersion(organizationId: string, versionId: Types.ObjectId) {
    const version = await this.versions.findOne({
      _id: versionId,
      organizationId: new Types.ObjectId(organizationId),
    });
    if (!version) {
      throw DomainException.notFound(
        ErrorCodes.TEMPLATE_VERSION_NOT_FOUND,
        'Template version not found.',
      );
    }
    return version;
  }

  async requirePublished(organizationId: string, templateId: string) {
    const template = await this.get(organizationId, templateId);
    if (!template.activeVersionId || template.status !== 'PUBLISHED') {
      throw DomainException.invalid(
        ErrorCodes.TEMPLATE_NOT_PUBLISHED,
        'Publish this template before creating documents from it.',
      );
    }
    return {
      template,
      version: await this.requireVersion(organizationId, template.activeVersionId),
    };
  }

  async duplicate(organizationId: string, id: string, createdById: string) {
    const template = await this.get(organizationId, id);
    const source =
      (template.activeVersionId
        ? await this.versions.findById(template.activeVersionId)
        : null) ?? (await this.draftVersion(template));
    const { template: copy, draft } = await this.upsertSingletonDraftTemplate(
      organizationId,
      createdById,
      {
        name: `${template.name} (copy)`,
        description: template.description,
        category: template.category,
        industry: template.industry,
        businessCategoryId: template.businessCategoryId,
      },
      {
        schemaJson: source.schemaJson,
        fieldSchemaJson: source.fieldSchemaJson,
        styleSchemaJson: source.styleSchemaJson,
        linesJson: source.linesJson,
        settingsJson: source.settingsJson,
        documentHtml: source.documentHtml ?? '',
      },
    );
    const categoriesById = await this.businessCategories.mapByIds([
      copy.businessCategoryId,
    ]);
    return { template: this.serializeTemplate(copy, categoriesById), draft: draft.toJSON() };
  }

  async archive(organizationId: string, id: string) {
    const template = await this.get(organizationId, id);
    template.status = 'ARCHIVED';
    template.archivedAt = new Date();
    await template.save();
    const categoriesById = await this.businessCategories.mapByIds([
      template.businessCategoryId,
    ]);
    return this.serializeTemplate(template, categoriesById);
  }

  async recordUsage(organizationId: string, templateId: Types.ObjectId | null) {
    if (!templateId) return;
    await this.templates.updateOne(
      { _id: templateId, organizationId: new Types.ObjectId(organizationId) },
      { $inc: { usageCount: 1 } },
    );
  }

  /**
   * The product keeps one working draft template per organisation.
   *
   * Starting a new template or duplicating into draft reuses that singleton
   * draft instead of creating more and more unpublished template rows.
   */
  private async upsertSingletonDraftTemplate(
    organizationId: string,
    createdById: string,
    meta: {
      name: string;
      description: string;
      category: string;
      industry: string;
      businessCategoryId: Types.ObjectId | null;
    },
    payload: {
      schemaJson: Record<string, unknown>;
      fieldSchemaJson: Record<string, unknown>;
      styleSchemaJson: Record<string, unknown>;
      linesJson: Record<string, unknown>;
      settingsJson: Record<string, unknown>;
      documentHtml: string;
    },
  ): Promise<{ template: TemplateDocument; draft: TemplateVersionDocument }> {
    const organizationObjectId = new Types.ObjectId(organizationId);
    let template = await this.consolidateDraftTemplates(organizationId);

    if (!template) {
      template = await this.templates.create({
        ...meta,
        organizationId: organizationObjectId,
        createdById: new Types.ObjectId(createdById),
        status: 'DRAFT',
      });
    } else {
      template.set({
        ...meta,
        status: 'DRAFT',
        archivedAt: null,
      });
      await template.save();
    }

    let draft = await this.currentDraftVersion(template);
    if (!draft) {
      const latest = await this.versions
        .findOne({ templateId: template._id })
        .sort({ versionNumber: -1 })
        .lean();

      draft = await this.versions.create({
        templateId: template._id,
        organizationId: organizationObjectId,
        versionNumber: (latest?.versionNumber ?? 0) + 1,
        ...payload,
        createdById: new Types.ObjectId(createdById),
      });
      template.draftVersionId = draft._id;
      await template.save();
      return { template, draft };
    }

    draft.schemaJson = payload.schemaJson;
    draft.fieldSchemaJson = payload.fieldSchemaJson;
    draft.styleSchemaJson = payload.styleSchemaJson;
    draft.linesJson = payload.linesJson;
    draft.settingsJson = payload.settingsJson;
    draft.documentHtml = payload.documentHtml;
    await draft.save();

    return { template, draft };
  }

  /**
   * Only the newest draft template is kept.
   *
   * Older unpublished templates are discarded with their version rows so the
   * database and the UI both converge on one current draft template.
   */
  private async consolidateDraftTemplates(
    organizationId: string,
  ): Promise<TemplateDocument | null> {
    const organizationObjectId = new Types.ObjectId(organizationId);
    const drafts = await this.templates
      .find({
        organizationId: organizationObjectId,
        status: 'DRAFT',
        archivedAt: null,
      })
      .sort({ updatedAt: -1, createdAt: -1 });

    if (!drafts.length) return null;

    const [latest, ...stale] = drafts;
    if (stale.length) {
      const staleIds = stale.map((template) => template._id);
      await this.versions.deleteMany({ templateId: { $in: staleIds } });
      await this.templates.deleteMany({ _id: { $in: staleIds } });
    }

    return latest;
  }

  /**
   * There should be only one editable draft per template.
   *
   * Older bugs could leave orphan unpublished versions behind. The newest
   * unpublished version becomes the working draft and the rest are discarded so
   * the database keeps only the recent draft the user is actually editing.
   */
  private async currentDraftVersion(
    template: TemplateDocument,
  ): Promise<TemplateVersionDocument | null> {
    const drafts = await this.versions
      .find({ templateId: template._id, publishedAt: null })
      .sort({ versionNumber: -1 });

    if (!drafts.length) {
      if (template.draftVersionId) {
        template.draftVersionId = null;
        await template.save();
      }
      return null;
    }

    const [latest, ...stale] = drafts;
    if (!template.draftVersionId || String(template.draftVersionId) !== String(latest._id)) {
      template.draftVersionId = latest._id;
      await template.save();
    }

    if (stale.length) {
      await this.versions.deleteMany({
        _id: { $in: stale.map((version) => version._id) },
      });
    }

    return latest;
  }

  private previewAnswers(fields: Array<Record<string, unknown>>) {
    const today = new Date();
    const isoDate = today.toISOString().slice(0, 10);
    const isoDateTime = today.toISOString().slice(0, 16);

    return Object.fromEntries(
      fields.map((field) => {
        const key = String(field.key ?? '');
        const label = String(field.label ?? key);
        const type = String(field.type ?? 'TEXT');
        const defaultValue = field.defaultValue;
        const options = Array.isArray(field.options) ? field.options.map(String) : [];

        if (defaultValue !== undefined && defaultValue !== null && String(defaultValue).trim() !== '') {
          return [key, this.coercePreviewValue(type, defaultValue)];
        }

        switch (type) {
          case 'NUMBER':
            return [key, 2];
          case 'CURRENCY':
            return [key, 48000];
          case 'PERCENTAGE':
            return [key, 10];
          case 'BOOLEAN':
            return [key, true];
          case 'DATE':
            return [key, isoDate];
          case 'DATETIME':
            return [key, isoDateTime];
          case 'SELECT':
          case 'PACKAGE_SELECT':
          case 'BLOCK_SELECT':
            return [key, options[0] ?? `Selected ${label}`];
          case 'MULTI_SELECT':
            return [key, options.slice(0, 2)];
          case 'EMAIL':
            return [key, 'alex@example.com'];
          case 'PHONE':
            return [key, '+91 98765 43210'];
          case 'URL':
            return [key, 'https://example.com'];
          case 'TEXTAREA':
            return [key, `${label} preview content`];
          default:
            return [key, this.previewTextForKey(key, label)];
        }
      }),
    );
  }

  private coercePreviewValue(type: string, value: unknown) {
    if (type === 'NUMBER' || type === 'CURRENCY' || type === 'PERCENTAGE') {
      const numeric = Number(value);
      return Number.isFinite(numeric) ? numeric : 0;
    }
    if (type === 'BOOLEAN') {
      if (typeof value === 'boolean') return value;
      return String(value).toLowerCase() === 'true';
    }
    if (type === 'MULTI_SELECT') {
      return Array.isArray(value) ? value.map(String) : String(value).split(',').map((entry) => entry.trim()).filter(Boolean);
    }
    return String(value);
  }

  private previewTextForKey(key: string, label: string) {
    const source = `${key} ${label}`.toLowerCase();
    if (source.includes('customer')) return 'Alex Morgan';
    if (source.includes('company')) return 'Sample Customer';
    if (source.includes('destination')) return 'Kochi';
    if (source.includes('hotel')) return 'Deluxe';
    if (source.includes('vehicle')) return 'Sedan';
    if (source.includes('venue')) return 'Grand Convention Hall';
    if (source.includes('finish')) return 'Acrylic';
    return label;
  }

  private previewPackages(
    blocks: Array<Record<string, unknown>>,
    defaultPackages: Array<Record<string, unknown>> = [],
  ) {
    const needsPackageContent = blocks.some((block) =>
      String(block.type ?? '') === 'package',
    );
    if (!needsPackageContent) return [];

    if (defaultPackages.length) {
      return defaultPackages.map((entry, index) => ({
        id: String(entry.id ?? `preview-package-${index + 1}`),
        name: String(entry.name ?? `Package ${index + 1}`),
        description: String(entry.description ?? ''),
        lineIds: Array.isArray(entry.lines)
          ? entry.lines.map((line, lineIndex) =>
              String((line as Record<string, unknown>).lineId ?? `preview-line-${index + 1}-${lineIndex + 1}`),
            )
          : [],
      }));
    }

    return [
      {
        id: 'preview-package',
        name: 'Signature Package',
        description: 'Sample package summary used to preview linked package content.',
        lineIds: ['preview-line-base', 'preview-line-optional'],
      },
    ];
  }

  private previewSections(
    blocks: Array<Record<string, unknown>>,
    documentHtml: string,
  ): DocumentSection[] {
    // A document-authored template prices through an item table in its body, so
    // that counts as pricing too — otherwise its preview shows an empty table.
    const hasPricing =
      blocks.some((block) => String(block.type ?? '') === 'pricingTable') ||
      documentBodyUsesItemTable(documentHtml);
    if (!hasPricing) return [];

    return [
      {
        id: 'preview-section',
        title: 'Preview Items',
        lines: [
          {
            id: 'preview-line-base',
            kind: 'ITEM',
            itemId: null,
            packageId: 'preview-package',
            packageName: 'Signature Package',
            name: 'Base package',
            description: 'Primary priced line for previewing the layout.',
            unit: 'nos',
            pricingMode: 'FIXED',
            quantity: 1,
            days: 1,
            rate: 4800000,
            percent: 0,
            formula: '',
            manualAmount: 0,
            discount: { mode: 'PERCENT', value: 0 },
            taxRateId: null,
            optional: false,
            selected: true,
          },
          {
            id: 'preview-line-transfer',
            kind: 'ITEM',
            itemId: null,
            packageId: null,
            packageName: '',
            name: 'Transfers',
            description: 'Secondary line to show multi-row pricing.',
            unit: 'nos',
            pricingMode: 'FIXED',
            quantity: 1,
            days: 1,
            rate: 1200000,
            percent: 0,
            formula: '',
            manualAmount: 0,
            discount: { mode: 'PERCENT', value: 0 },
            taxRateId: null,
            optional: false,
            selected: true,
          },
          {
            id: 'preview-line-optional',
            kind: 'ITEM',
            itemId: null,
            packageId: null,
            packageName: '',
            name: 'Optional add-on',
            description: 'Shown separately so optional pricing stays visible.',
            unit: 'nos',
            pricingMode: 'FIXED',
            quantity: 1,
            days: 1,
            rate: 800000,
            percent: 0,
            formula: '',
            manualAmount: 0,
            discount: { mode: 'PERCENT', value: 0 },
            taxRateId: null,
            optional: true,
            selected: false,
          },
        ],
      },
    ];
  }

  /**
   * The wire shape for a template. `id` is normalised to a string so callers
   * never have to know whether they were handed a hydrated document or a lean
   * record — the union of those two used to leave `_id` off the inferred type.
   */
  private serializeTemplate(
    template: TemplateDocument | (Record<string, unknown> & { businessCategoryId?: Types.ObjectId | null }),
    categoriesById: Map<string, Record<string, unknown>>,
  ): Record<string, unknown> & { id: string } {
    const record: Record<string, unknown> =
      typeof (template as TemplateDocument).toJSON === 'function'
        ? (template as TemplateDocument).toJSON()
        : template;
    const businessCategoryId =
      (record.businessCategoryId as Types.ObjectId | string | null | undefined)?.toString() ?? '';

    return {
      ...record,
      id: String(record.id ?? record._id ?? ''),
      businessCategory: categoriesById.get(businessCategoryId) ?? null,
    };
  }
}
