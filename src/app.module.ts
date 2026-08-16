import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';

import { AuthModule } from './auth/auth.module';
import { BillingModule } from './billing/billing.module';
import { BlogModule } from './blog/blog.module';
import { BusinessCategoriesModule } from './business-categories/business-categories.module';
import { CatalogModule } from './catalog/catalog.module';
import { AppConfigModule } from './common/config/config.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { CsrfGuard } from './common/guards/csrf.guard';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { OrganizationGuard } from './common/guards/organization.guard';
import { PermissionsGuard } from './common/guards/permissions.guard';
import { CustomersModule } from './customers/customers.module';
import { DatabaseModule } from './database/database.module';
import { DocumentsModule } from './documents/documents.module';
import { HealthModule } from './health/health.module';
import { MembersModule } from './members/members.module';
import { OrganizationsModule } from './organizations/organizations.module';
import { PackagesModule } from './packages/packages.module';
import { PlatformAdminModule } from './platform-admin/platform-admin.module';
import { PublicProposalsModule } from './public-proposals/public-proposals.module';
import { LeadsModule } from './leads/leads.module';
import { RenderingModule } from './rendering/rendering.module';
import { ReusableBlocksModule } from './reusable-blocks/reusable-blocks.module';
import { TemplateEngineModule } from './template-engine/template-engine.module';
import { TemplatesModule } from './templates/templates.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    AppConfigModule,
    DatabaseModule,
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 300 }]),

    UsersModule,
    AuthModule,
    BusinessCategoriesModule,
    OrganizationsModule,
    MembersModule,
    CustomersModule,
    CatalogModule,
    PackagesModule,
    LeadsModule,
    ReusableBlocksModule,
    TemplateEngineModule,
    TemplatesModule,
    RenderingModule,
    DocumentsModule,
    PublicProposalsModule,
    BillingModule,
    BlogModule,
    PlatformAdminModule,
    HealthModule,
  ],
  providers: [
    { provide: APP_FILTER, useClass: AllExceptionsFilter },

    // Order matters: throttle, then authenticate, then reject cross-site writes,
    // then resolve the tenant, and only then check permissions — a permission
    // check is meaningless before we know which organization it applies to.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: CsrfGuard },
    { provide: APP_GUARD, useClass: OrganizationGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
  ],
})
export class AppModule {}
