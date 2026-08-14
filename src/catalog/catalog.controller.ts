import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { AuthenticatedUser, TenantContext } from 'src/common/context/request-context';
import { CurrentTenant, CurrentUser, RequirePermissions } from 'src/common/decorators';
import { CatalogService } from './catalog.service';
import {
  CreateItemDto,
  CreateTaxRateDto,
  ItemQuery,
  UpdateItemDto,
  UpdateTaxRateDto,
} from './dto/catalog.dto';

@ApiTags('catalog')
@Controller()
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}

  @Get('items')
  @RequirePermissions('catalog.view')
  listItems(@CurrentTenant() tenant: TenantContext, @Query() query: ItemQuery) {
    return this.catalog.listItems(tenant.organizationId, query);
  }

  @Get('items/:id')
  @RequirePermissions('catalog.view')
  getItem(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    return this.catalog.getItem(tenant.organizationId, id);
  }

  @Post('items')
  @RequirePermissions('catalog.manage')
  createItem(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: CreateItemDto,
  ) {
    return this.catalog.createItem(tenant.organizationId, user.userId, body);
  }

  @Patch('items/:id')
  @RequirePermissions('catalog.manage')
  updateItem(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
    @Body() body: UpdateItemDto,
  ) {
    return this.catalog.updateItem(tenant.organizationId, id, body);
  }

  @Delete('items/:id')
  @RequirePermissions('catalog.manage')
  archiveItem(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    return this.catalog.archiveItem(tenant.organizationId, id);
  }

  @Get('tax-rates')
  @RequirePermissions('catalog.view')
  listTaxRates(@CurrentTenant() tenant: TenantContext) {
    return this.catalog.listTaxRates(tenant.organizationId);
  }

  @Post('tax-rates')
  @RequirePermissions('catalog.manage')
  createTaxRate(@CurrentTenant() tenant: TenantContext, @Body() body: CreateTaxRateDto) {
    return this.catalog.createTaxRate(tenant.organizationId, body);
  }

  @Patch('tax-rates/:id')
  @RequirePermissions('catalog.manage')
  updateTaxRate(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
    @Body() body: UpdateTaxRateDto,
  ) {
    return this.catalog.updateTaxRate(tenant.organizationId, id, body);
  }
}
