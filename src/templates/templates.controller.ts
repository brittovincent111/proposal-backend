import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { AuthenticatedUser, TenantContext } from 'src/common/context/request-context';
import { CurrentTenant, CurrentUser, RequirePermissions } from 'src/common/decorators';
import {
  CreateTemplateDto,
  PublishTemplateDto,
  TemplateQuery,
  UpdateDraftFieldsDto,
  UpdateDraftSchemaDto,
  UpdateDraftDocumentDto,
  UpdateDraftLinesDto,
  UpdateDraftSettingsDto,
  UpdateDraftStyleDto,
  UpdateTemplateDto,
} from './dto/template.dto';
import { TemplatesService } from './templates.service';

@ApiTags('templates')
@Controller('templates')
export class TemplatesController {
  constructor(private readonly templates: TemplatesService) {}

  @Get()
  @RequirePermissions('template.view')
  list(@CurrentTenant() tenant: TenantContext, @Query() query: TemplateQuery) {
    return this.templates.list(tenant.organizationId, query);
  }

  @Get(':id')
  @RequirePermissions('template.view')
  @ApiOperation({ summary: 'Template metadata with its editable draft version.' })
  get(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    return this.templates.detail(tenant.organizationId, id);
  }

  @Get(':id/preview')
  @RequirePermissions('template.view')
  @Header('Content-Type', 'text/html; charset=utf-8')
  @ApiOperation({ summary: 'Rendered preview of the current draft using sample values.' })
  preview(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    return this.templates.preview(tenant.organizationId, id);
  }

  @Post()
  @RequirePermissions('template.create')
  create(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: CreateTemplateDto,
  ) {
    return this.templates.create(tenant.organizationId, user.userId, body);
  }

  @Patch(':id')
  @RequirePermissions('template.edit')
  update(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
    @Body() body: UpdateTemplateDto,
  ) {
    return this.templates.update(tenant.organizationId, id, body);
  }

  @Patch(':id/draft/schema')
  @RequirePermissions('template.edit')
  @ApiOperation({ summary: 'Replaces the draft document structure (blocks).' })
  updateDraftSchema(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
    @Body() body: UpdateDraftSchemaDto,
  ) {
    return this.templates.updateDraft(tenant.organizationId, id, { schemaJson: body.schemaJson });
  }

  @Patch(':id/draft/fields')
  @RequirePermissions('template.edit')
  @ApiOperation({ summary: 'Replaces the draft questions, groups and calculations.' })
  updateDraftFields(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
    @Body() body: UpdateDraftFieldsDto,
  ) {
    return this.templates.updateDraft(tenant.organizationId, id, {
      fieldSchemaJson: body.fieldSchemaJson,
    });
  }

  @Patch(':id/draft/settings')
  @RequirePermissions('template.edit')
  @ApiOperation({
    summary: 'Defaults a quotation inherits from this template.',
    description:
      'Terms, payment terms and validity. Applied when the template is attached; the quotation may override any of them afterwards.',
  })
  updateDraftSettings(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
    @Body() body: UpdateDraftSettingsDto,
  ) {
    return this.templates.updateDraft(tenant.organizationId, id, {
      settingsJson: body.settingsJson,
    });
  }

  @Patch(':id/draft/lines')
  @RequirePermissions('template.edit')
  @ApiOperation({
    summary: 'Default line items a quotation starts with.',
    description:
      'Copied by value into the draft when a quotation is created, so editing them later never changes a quotation that already used them.',
  })
  updateDraftLines(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
    @Body() body: UpdateDraftLinesDto,
  ) {
    return this.templates.updateDraft(tenant.organizationId, id, {
      linesJson: body.linesJson,
    });
  }

  @Patch(':id/draft/document')
  @RequirePermissions('template.edit')
  @ApiOperation({
    summary: 'The free-form document body, as authored in the document editor.',
    description:
      'Replaces the block body when set. Sanitised on save, so what is stored is what a customer can safely be shown.',
  })
  updateDraftDocument(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
    @Body() body: UpdateDraftDocumentDto,
  ) {
    return this.templates.updateDraft(tenant.organizationId, id, {
      documentHtml: body.documentHtml,
    });
  }

  @Patch(':id/draft/style')
  @RequirePermissions('template.edit')
  updateDraftStyle(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
    @Body() body: UpdateDraftStyleDto,
  ) {
    return this.templates.updateDraft(tenant.organizationId, id, {
      styleSchemaJson: body.styleSchemaJson,
    });
  }

  @Post(':id/validate')
  @RequirePermissions('template.view')
  @ApiOperation({ summary: 'Errors block publish; warnings do not.' })
  validate(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    return this.templates.validate(tenant.organizationId, id);
  }

  @Post(':id/publish')
  @RequirePermissions('template.publish')
  @ApiOperation({ summary: 'Freezes the draft as the new active version.' })
  publish(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
    @Body() body: PublishTemplateDto,
  ) {
    return this.templates.publish(tenant.organizationId, id, body);
  }

  @Post(':id/duplicate')
  @RequirePermissions('template.create')
  duplicate(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.templates.duplicate(tenant.organizationId, id, user.userId);
  }

  @Post(':id/archive')
  @RequirePermissions('template.delete')
  archive(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    return this.templates.archive(tenant.organizationId, id);
  }

  @Get(':id/versions')
  @RequirePermissions('template.view')
  versions(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    return this.templates.listVersions(tenant.organizationId, id);
  }

  @Get(':id/versions/:version')
  @RequirePermissions('template.view')
  version(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
    @Param('version', ParseIntPipe) version: number,
  ) {
    return this.templates.getVersion(tenant.organizationId, id, version);
  }
}
