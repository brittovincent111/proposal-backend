import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import {
  presentInvoice,
  presentPlanForAdmin,
  presentSubscription,
  presentSummary,
  presentDiscount,
  toDiscountModel,
} from 'src/billing/billing.presenter';
import { AssignPlanDto, CreatePlanDto, UpdatePlanDto } from 'src/billing/dto/billing.dto';
import { CreateDiscountDto, UpdateDiscountDto } from 'src/billing/dto/discount.dto';
import { DiscountsService } from 'src/billing/discounts.service';
import { InvoicesService } from 'src/billing/invoices.service';
import { PlansService } from 'src/billing/plans.service';
import { SubscriptionsService } from 'src/billing/subscriptions.service';
import { SkipTenant } from 'src/common/decorators';
import { LeadsService } from 'src/leads/leads.service';
import {
  ListLeadsQueryDto,
  ListTenantsQueryDto,
  SetTenantStatusDto,
} from './dto/platform-admin.dto';
import { PlatformAdminGuard } from './platform-admin.guard';
import { PlatformAdminService } from './platform-admin.service';

/**
 * The platform owner's console — every tenant, every subscription, every rupee.
 *
 * `@SkipTenant()` at class level because a platform admin has no membership in
 * the organizations they are looking at; PlatformAdminGuard is what authorises
 * these routes instead of the usual permission check.
 */
@ApiTags('platform-admin')
@Controller('admin')
@SkipTenant()
@UseGuards(PlatformAdminGuard)
export class PlatformAdminController {
  constructor(
    private readonly admin: PlatformAdminService,
    private readonly plans: PlansService,
    private readonly subscriptions: SubscriptionsService,
    private readonly invoices: InvoicesService,
    private readonly discounts: DiscountsService,
    private readonly leads: LeadsService,
  ) {}

  @Get('session')
  @ApiOperation({ summary: 'Confirms the caller may use the console.' })
  session() {
    // Reaching the handler at all means the guard passed, which is the answer
    // the frontend needs before it renders the console shell.
    return { isPlatformAdmin: true };
  }

  @Get('metrics')
  @ApiOperation({ summary: 'MRR, tenant counts, plan mix and the signup curve.' })
  metrics() {
    return this.admin.metrics();
  }

  @Get('leads')
  @ApiOperation({ summary: 'Marketing leads captured from the public website.' })
  leadsIndex(@Query() query: ListLeadsQueryDto) {
    return this.leads.list(query);
  }

  // ------------------------------------------------------------------ tenants

  @Get('organizations')
  organizations(@Query() query: ListTenantsQueryDto) {
    return this.admin.listTenants(query);
  }

  @Get('organizations/:id')
  async organization(@Param('id') id: string) {
    const detail = await this.admin.tenantDetail(id);
    return {
      tenant: detail.tenant,
      summary: presentSummary(detail.summary),
      invoices: detail.invoices.map(presentInvoice),
      members: detail.members,
    };
  }

  @Patch('organizations/:id/status')
  @ApiOperation({ summary: 'Suspends or reinstates a tenant.' })
  async setStatus(@Param('id') id: string, @Body() body: SetTenantStatusDto) {
    const organization = await this.admin.setTenantStatus(id, body.status);
    return { id: organization._id.toString(), status: organization.status };
  }

  @Post('organizations/:id/plan')
  @ApiOperation({ summary: 'Moves a tenant onto a plan without taking payment.' })
  async assignPlan(@Param('id') id: string, @Body() body: AssignPlanDto) {
    const subscription = await this.subscriptions.assignPlan(id, body);
    return presentSubscription(subscription);
  }

  // -------------------------------------------------------------------- plans

  @Get('plans')
  async allPlans() {
    const [plans, counts] = await Promise.all([
      this.plans.listAll(),
      this.plans.subscriberCounts(),
    ]);
    return { plans: plans.map((plan) => presentPlanForAdmin(plan, counts[plan.code] ?? 0)) };
  }

  @Post('plans')
  async createPlan(@Body() body: CreatePlanDto) {
    const plan = await this.plans.create(body);
    return presentPlanForAdmin(plan, 0);
  }

  @Patch('plans/:id')
  async updatePlan(@Param('id') id: string, @Body() body: UpdatePlanDto) {
    const [plan, counts] = await Promise.all([
      this.plans.update(id, body),
      this.plans.subscriberCounts(),
    ]);
    return presentPlanForAdmin(plan, counts[plan.code] ?? 0);
  }

  @Patch('plans/:id/archive')
  async archivePlan(@Param('id') id: string) {
    const plan = await this.plans.archive(id);
    return presentPlanForAdmin(plan, 0);
  }

  // ---------------------------------------------------------------- discounts

  @Get('discounts')
  async allDiscounts() {
    const discounts = await this.discounts.listAll();
    return { discounts: discounts.map(presentDiscount) };
  }

  @Post('discounts')
  async createDiscount(@Body() body: CreateDiscountDto) {
    return presentDiscount(await this.discounts.create(toDiscountModel(body)));
  }

  @Patch('discounts/:id')
  async updateDiscount(@Param('id') id: string, @Body() body: UpdateDiscountDto) {
    return presentDiscount(await this.discounts.update(id, toDiscountModel(body)));
  }

  @Get('discounts/:id/redemptions')
  async discountRedemptions(@Param('id') id: string) {
    const rows = await this.discounts.redemptionsFor(id);
    return {
      redemptions: rows.map((row) => ({
        id: row._id.toString(),
        organizationId: row.organizationId.toString(),
        code: row.code,
        planCode: row.planCode,
        amountOff: row.amountOff,
        redeemedAt: row.redeemedAt?.toISOString() ?? null,
      })),
    };
  }

  // ----------------------------------------------------------------- invoices

  @Get('invoices')
  async recentInvoices() {
    const invoices = await this.invoices.listRecent(50);
    return { invoices: invoices.map(presentInvoice) };
  }
}
