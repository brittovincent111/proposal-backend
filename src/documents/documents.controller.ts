import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  Patch,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';

import { AuthenticatedUser, TenantContext } from 'src/common/context/request-context';
import { CurrentTenant, CurrentUser, RequirePermissions } from 'src/common/decorators';
import { DocumentsService } from './documents.service';
import {
  AddPackageDto,
  CreateDocumentDto,
  CreateRevisionDto,
  DocumentQuery,
  SendDocumentDto,
  UpdateDocumentDto,
} from './dto/document.dto';

@ApiTags('documents')
@Controller('documents')
export class DocumentsController {
  constructor(private readonly documents: DocumentsService) {}

  @Get()
  @RequirePermissions('document.view')
  list(@CurrentTenant() tenant: TenantContext, @Query() query: DocumentQuery) {
    return this.documents.list(tenant.organizationId, query);
  }

  @Get(':id')
  @RequirePermissions('document.view')
  get(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    return this.documents.detail(tenant.organizationId, id);
  }

  @Post()
  @RequirePermissions('document.create')
  @ApiOperation({ summary: 'Creates a draft and allocates its document number.' })
  create(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: CreateDocumentDto,
  ) {
    return this.documents.create(tenant.organizationId, user.userId, body);
  }

  @Patch(':id')
  @RequirePermissions('document.edit')
  @ApiOperation({ summary: 'Edits this document only; the master template is untouched.' })
  update(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: UpdateDocumentDto,
  ) {
    return this.documents.update(tenant.organizationId, id, user.userId, body);
  }

  @Post(':id/packages')
  @RequirePermissions('document.edit')
  @ApiOperation({ summary: 'Expands a package into line items as a snapshot.' })
  addPackage(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: AddPackageDto,
  ) {
    return this.documents.addPackage(tenant.organizationId, id, user.userId, body);
  }

  @Post(':id/generate')
  @RequirePermissions('document.edit')
  @ApiOperation({ summary: 'Compiles the draft into the current revision snapshot.' })
  generate(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.documents.generate(tenant.organizationId, id, user.userId);
  }

  @Get(':id/revisions')
  @RequirePermissions('document.view')
  revisions(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    return this.documents.listRevisions(tenant.organizationId, id);
  }

  @Post(':id/revisions')
  @RequirePermissions('document.edit')
  createRevision(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: CreateRevisionDto,
  ) {
    return this.documents.createRevision(tenant.organizationId, id, user.userId, body);
  }

  @Get(':id/revisions/:revisionId')
  @RequirePermissions('document.view')
  revision(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
    @Param('revisionId') revisionId: string,
  ) {
    return this.documents.getRevision(tenant.organizationId, id, revisionId);
  }

  @Post(':id/request-approval')
  @RequirePermissions('document.edit')
  requestApproval(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.documents.requestApproval(tenant.organizationId, id, user.userId);
  }

  @Post(':id/approve')
  @RequirePermissions('document.approve')
  approve(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.documents.approve(tenant.organizationId, id, user.userId);
  }

  @Post(':id/send')
  @RequirePermissions('document.send')
  @ApiOperation({ summary: 'Freezes the revision and returns the share token (shown once).' })
  send(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: SendDocumentDto,
  ) {
    return this.documents.send(tenant.organizationId, id, user.userId, body);
  }

  @Post(':id/share/revoke')
  @RequirePermissions('document.send')
  revokeShare(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.documents.revokeShareLink(tenant.organizationId, id, user.userId);
  }

  @Post(':id/archive')
  @RequirePermissions('document.delete')
  archive(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.documents.archive(tenant.organizationId, id, user.userId);
  }

  @Get(':id/events')
  @RequirePermissions('document.view')
  events(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    return this.documents.timeline(tenant.organizationId, id);
  }

  @Get(':id/preview')
  @RequirePermissions('document.view')
  @Header('Content-Type', 'text/html; charset=utf-8')
  @ApiOperation({ summary: 'Server-rendered HTML of the current draft.' })
  preview(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    return this.documents.preview(tenant.organizationId, id);
  }

  @Get(':id/revisions/:revisionId/html')
  @RequirePermissions('document.view')
  @Header('Content-Type', 'text/html; charset=utf-8')
  revisionHtml(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
    @Param('revisionId') revisionId: string,
  ) {
    return this.documents.renderRevision(tenant.organizationId, id, revisionId);
  }

  @Get(':id/pdf')
  @RequirePermissions('document.view')
  async pdf(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
    @Res() response: Response,
  ) {
    const result = await this.documents.pdfForCurrentRevision(tenant.organizationId, id);
    response.setHeader('Content-Type', result.contentType);
    response.send(result.buffer);
  }
}
