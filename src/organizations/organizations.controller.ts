import { Body, Controller, Get, Patch } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { TenantContext } from 'src/common/context/request-context';
import { CurrentTenant, RequirePermissions } from 'src/common/decorators';
import { flattenPatch } from 'src/common/utils/patch';
import {
  UpdateOrganizationDto,
  UpdateOrganizationSettingsDto,
} from './dto/organization.dto';
import { OrganizationsService } from './organizations.service';

@ApiTags('organizations')
@Controller('organizations')
export class OrganizationsController {
  constructor(private readonly organizations: OrganizationsService) {}

  @Get('current')
  @ApiOperation({ summary: 'The organization the caller is acting in.' })
  async current(@CurrentTenant() tenant: TenantContext) {
    const organization = await this.organizations.findById(tenant.organizationId);
    return { ...organization.toJSON(), role: tenant.role, permissions: [...tenant.permissions] };
  }

  @Patch('current')
  @RequirePermissions('organization.manage')
  update(@CurrentTenant() tenant: TenantContext, @Body() body: UpdateOrganizationDto) {
    return this.organizations.update(tenant.organizationId, body);
  }

  @Get('current/settings')
  settings(@CurrentTenant() tenant: TenantContext) {
    return this.organizations.getSettings(tenant.organizationId);
  }

  @Patch('current/settings')
  @RequirePermissions('organization.manage')
  updateSettings(
    @CurrentTenant() tenant: TenantContext,
    @Body() body: UpdateOrganizationSettingsDto,
  ) {
    return this.organizations.updateSettings(
      tenant.organizationId,
      flattenPatch(body as unknown as Record<string, unknown>),
    );
  }
}
