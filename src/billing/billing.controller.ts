import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { AuthenticatedUser, TenantContext } from 'src/common/context/request-context';
import { CurrentTenant, CurrentUser, Public, RequirePermissions } from 'src/common/decorators';
import {
  CancelSubscriptionDto,
  StartCheckoutDto,
  VerifyCheckoutDto,
} from './dto/billing.dto';
import { PreviewPriceDto } from './dto/discount.dto';
import { DiscountsService } from './discounts.service';
import { presentPlan, presentSubscription, presentSummary } from './billing.presenter';
import { InvoicesService } from './invoices.service';
import { PlansService } from './plans.service';
import { SubscriptionsService } from './subscriptions.service';

@ApiTags('billing')
@Controller('billing')
export class BillingController {
  constructor(
    private readonly plans: PlansService,
    private readonly subscriptions: SubscriptionsService,
    private readonly invoices: InvoicesService,
    private readonly discounts: DiscountsService,
  ) {}

  @Get('plans')
  @Public()
  @ApiOperation({ summary: 'Public plan catalogue, for the pricing page.' })
  async publicPlans() {
    const plans = await this.plans.listPublic();
    return { plans: plans.map(presentPlan) };
  }

  @Get('offers')
  @Public()
  @ApiOperation({ summary: 'Live, advertised offers for the pricing page.' })
  async publicOffers() {
    const offers = await this.discounts.listAdvertised();
    return {
      offers: offers.map((offer) => ({
        // Only what a visitor needs. Caps, eligibility and internal notes stay
        // on the server — they are operating detail, not marketing copy.
        code: offer.code,
        name: offer.name,
        type: offer.type,
        value: offer.value,
        planCodes: offer.planCodes,
        endsAt: offer.endsAt?.toISOString() ?? null,
      })),
    };
  }

  @Get('subscription')
  @RequirePermissions('billing.view')
  @ApiOperation({ summary: 'The caller organization’s plan, usage and entitlement.' })
  async subscription(@CurrentTenant() tenant: TenantContext) {
    return presentSummary(await this.subscriptions.summaryFor(tenant.organizationId));
  }

  @Get('invoices')
  @RequirePermissions('billing.view')
  async invoiceHistory(@CurrentTenant() tenant: TenantContext) {
    const invoices = await this.invoices.listForOrganization(tenant.organizationId);
    return {
      invoices: invoices.map((invoice) => ({
        id: invoice._id.toString(),
        number: invoice.number,
        description: invoice.description,
        currency: invoice.currency,
        total: invoice.total,
        status: invoice.status,
        issuedAt: invoice.issuedAt?.toISOString() ?? null,
        paidAt: invoice.paidAt?.toISOString() ?? null,
        hostedUrl: invoice.gateway.hostedUrl,
      })),
    };
  }

  @Post('price')
  @RequirePermissions('billing.view')
  @ApiOperation({ summary: 'What a plan would cost, with a coupon applied.' })
  async price(@CurrentTenant() tenant: TenantContext, @Body() body: PreviewPriceDto) {
    const plan = await this.plans.findByCode(body.planCode);
    return this.discounts.priceFor(tenant.organizationId, plan, body.code);
  }

  @Post('checkout')
  @RequirePermissions('billing.manage')
  @ApiOperation({ summary: 'Opens a Razorpay subscription and returns checkout parameters.' })
  checkout(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: StartCheckoutDto,
  ) {
    return this.subscriptions.startCheckout(
      tenant.organizationId,
      { email: user.email, name: user.email },
      body,
    );
  }

  @Post('checkout/verify')
  @RequirePermissions('billing.manage')
  @ApiOperation({ summary: 'Confirms a completed checkout and applies the plan change.' })
  async verify(@CurrentTenant() tenant: TenantContext, @Body() body: VerifyCheckoutDto) {
    const subscription = await this.subscriptions.verifyCheckout(tenant.organizationId, body);
    return presentSubscription(subscription);
  }

  @Post('cancel')
  @RequirePermissions('billing.manage')
  async cancel(@CurrentTenant() tenant: TenantContext, @Body() body: CancelSubscriptionDto) {
    const subscription = await this.subscriptions.cancel(tenant.organizationId, body);
    return presentSubscription(subscription);
  }
}
