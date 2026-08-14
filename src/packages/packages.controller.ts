import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { AuthenticatedUser, TenantContext } from 'src/common/context/request-context';
import { CurrentTenant, CurrentUser, RequirePermissions } from 'src/common/decorators';
import { CreatePackageDto, PackageQuery, UpdatePackageDto } from './dto/package.dto';
import { PackagesService } from './packages.service';

@ApiTags('packages')
@Controller('packages')
export class PackagesController {
  constructor(private readonly packages: PackagesService) {}

  @Get()
  @RequirePermissions('package.view')
  list(@CurrentTenant() tenant: TenantContext, @Query() query: PackageQuery) {
    return this.packages.list(tenant.organizationId, query);
  }

  @Get(':id')
  @RequirePermissions('package.view')
  get(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    return this.packages.get(tenant.organizationId, id);
  }

  @Post()
  @RequirePermissions('package.manage')
  create(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: CreatePackageDto,
  ) {
    return this.packages.create(tenant.organizationId, user.userId, body);
  }

  @Patch(':id')
  @RequirePermissions('package.manage')
  @ApiOperation({ summary: 'Edits the package; documents that already used it keep their snapshot.' })
  update(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
    @Body() body: UpdatePackageDto,
  ) {
    return this.packages.update(tenant.organizationId, id, body);
  }

  @Post(':id/duplicate')
  @RequirePermissions('package.manage')
  duplicate(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.packages.duplicate(tenant.organizationId, id, user.userId);
  }

  @Post(':id/publish')
  @RequirePermissions('package.manage')
  publish(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    return this.packages.publish(tenant.organizationId, id);
  }

  @Post(':id/archive')
  @RequirePermissions('package.manage')
  archive(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    return this.packages.archive(tenant.organizationId, id);
  }
}
