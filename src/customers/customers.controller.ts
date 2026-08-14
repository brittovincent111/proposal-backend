import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { AuthenticatedUser, TenantContext } from 'src/common/context/request-context';
import { CurrentTenant, CurrentUser, RequirePermissions } from 'src/common/decorators';
import { CustomersService } from './customers.service';
import { CreateCustomerDto, CustomerQuery, UpdateCustomerDto } from './dto/customer.dto';

@ApiTags('customers')
@Controller('customers')
export class CustomersController {
  constructor(private readonly customers: CustomersService) {}

  @Get()
  @RequirePermissions('customer.view')
  list(@CurrentTenant() tenant: TenantContext, @Query() query: CustomerQuery) {
    return this.customers.list(tenant.organizationId, query);
  }

  @Get(':id')
  @RequirePermissions('customer.view')
  get(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    return this.customers.get(tenant.organizationId, id);
  }

  @Post()
  @RequirePermissions('customer.manage')
  create(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: CreateCustomerDto,
  ) {
    return this.customers.create(tenant.organizationId, user.userId, body);
  }

  @Patch(':id')
  @RequirePermissions('customer.manage')
  update(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
    @Body() body: UpdateCustomerDto,
  ) {
    return this.customers.update(tenant.organizationId, id, body);
  }

  @Delete(':id')
  @RequirePermissions('customer.manage')
  @ApiOperation({ summary: 'Archives the customer; historical documents are unaffected.' })
  archive(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    return this.customers.archive(tenant.organizationId, id);
  }

  @Post(':id/restore')
  @RequirePermissions('customer.manage')
  restore(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    return this.customers.restore(tenant.organizationId, id);
  }
}
