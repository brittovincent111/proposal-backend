import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { BusinessCategoriesModule } from 'src/business-categories/business-categories.module';
import { TaxRate, TaxRateSchema } from 'src/catalog/tax-rate.schema';
import {
  OrganizationMember,
  OrganizationMemberSchema,
} from 'src/members/organization-member.schema';
import {
  OrganizationSettings,
  OrganizationSettingsSchema,
} from './organization-settings.schema';
import { Organization, OrganizationSchema } from './organization.schema';
import { OrganizationsController } from './organizations.controller';
import { OrganizationsService } from './organizations.service';

@Module({
  imports: [
    BusinessCategoriesModule,
    MongooseModule.forFeature([
      { name: Organization.name, schema: OrganizationSchema },
      { name: OrganizationSettings.name, schema: OrganizationSettingsSchema },
      { name: OrganizationMember.name, schema: OrganizationMemberSchema },
      { name: TaxRate.name, schema: TaxRateSchema },
    ]),
  ],
  controllers: [OrganizationsController],
  providers: [OrganizationsService],
  exports: [OrganizationsService, MongooseModule],
})
export class OrganizationsModule {}
