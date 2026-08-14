import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiOperation, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { IsEmail, IsIn } from 'class-validator';

import { TenantContext } from 'src/common/context/request-context';
import { CurrentTenant, CurrentUser, RequirePermissions } from 'src/common/decorators';
import { AuthenticatedUser } from 'src/common/context/request-context';
import { Role, Roles } from 'src/permissions/permissions';
import { MembersService } from './members.service';
import { MemberStatus } from './organization-member.schema';

class InviteMemberDto {
  @ApiPropertyOptional({ example: 'sales@abctravels.in' })
  @IsEmail()
  email!: string;

  @ApiPropertyOptional({ enum: Roles })
  @IsIn(Roles)
  role!: Role;
}

class UpdateRoleDto {
  @ApiPropertyOptional({ enum: Roles })
  @IsIn(Roles)
  role!: Role;
}

class UpdateStatusDto {
  @ApiPropertyOptional({ enum: ['ACTIVE', 'SUSPENDED'] })
  @IsIn(['ACTIVE', 'SUSPENDED'])
  status!: MemberStatus;
}

@ApiTags('members')
@Controller('members')
export class MembersController {
  constructor(private readonly members: MembersService) {}

  @Get()
  @RequirePermissions('team.manage')
  list(@CurrentTenant() tenant: TenantContext) {
    return this.members.list(tenant.organizationId);
  }

  @Post('invite')
  @RequirePermissions('team.manage')
  @ApiOperation({ summary: 'Adds a member; creates a placeholder account if needed.' })
  invite(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: InviteMemberDto,
  ) {
    return this.members.invite(tenant.organizationId, body, user.userId);
  }

  @Patch(':id/role')
  @RequirePermissions('team.manage')
  updateRole(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
    @Body() body: UpdateRoleDto,
  ) {
    return this.members.updateRole(tenant.organizationId, id, body.role);
  }

  @Patch(':id/status')
  @RequirePermissions('team.manage')
  updateStatus(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
    @Body() body: UpdateStatusDto,
  ) {
    return this.members.updateStatus(tenant.organizationId, id, body.status);
  }
}
