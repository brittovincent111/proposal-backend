import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { BusinessCategoriesModule } from 'src/business-categories/business-categories.module';
import { OrganizationsModule } from 'src/organizations/organizations.module';
import { RenderingModule } from 'src/rendering/rendering.module';
import { TemplateEngineModule } from 'src/template-engine/template-engine.module';
import { TemplateVersion, TemplateVersionSchema } from './template-version.schema';
import { Template, TemplateSchema } from './template.schema';
import { TemplatesController } from './templates.controller';
import { TemplatesService } from './templates.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Template.name, schema: TemplateSchema },
      { name: TemplateVersion.name, schema: TemplateVersionSchema },
    ]),
    BusinessCategoriesModule,
    OrganizationsModule,
    RenderingModule,
    TemplateEngineModule,
  ],
  controllers: [TemplatesController],
  providers: [TemplatesService],
  exports: [TemplatesService, MongooseModule],
})
export class TemplatesModule {}
