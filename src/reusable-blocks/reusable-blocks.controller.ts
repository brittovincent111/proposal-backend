import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { AuthenticatedUser, TenantContext } from 'src/common/context/request-context';
import { CurrentTenant, CurrentUser, RequirePermissions } from 'src/common/decorators';
import {
  CreateReusableBlockDto,
  ReusableBlockQuery,
  UpdateReusableBlockDto,
} from './dto/reusable-block.dto';
import { ReusableBlocksService } from './reusable-blocks.service';

@ApiTags('reusable-blocks')
@Controller('reusable-blocks')
export class ReusableBlocksController {
  constructor(private readonly blocks: ReusableBlocksService) {}

  @Get()
  @RequirePermissions('block.view')
  list(@CurrentTenant() tenant: TenantContext, @Query() query: ReusableBlockQuery) {
    return this.blocks.list(tenant.organizationId, query);
  }

  @Get(':id')
  @RequirePermissions('block.view')
  get(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    return this.blocks.get(tenant.organizationId, id);
  }

  @Post()
  @RequirePermissions('block.manage')
  create(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: CreateReusableBlockDto,
  ) {
    return this.blocks.create(tenant.organizationId, user.userId, body);
  }

  @Patch(':id')
  @RequirePermissions('block.manage')
  update(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
    @Body() body: UpdateReusableBlockDto,
  ) {
    return this.blocks.update(tenant.organizationId, id, body);
  }

  @Post(':id/duplicate')
  @RequirePermissions('block.manage')
  duplicate(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.blocks.duplicate(tenant.organizationId, id, user.userId);
  }

  @Post(':id/archive')
  @RequirePermissions('block.manage')
  archive(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    return this.blocks.archive(tenant.organizationId, id);
  }
}
