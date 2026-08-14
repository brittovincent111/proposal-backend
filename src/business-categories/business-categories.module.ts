import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import {
  BusinessCategory,
  BusinessCategorySchema,
} from './business-category.schema';
import { BusinessCategoriesController } from './business-categories.controller';
import { BusinessCategoriesService } from './business-categories.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: BusinessCategory.name, schema: BusinessCategorySchema },
    ]),
  ],
  controllers: [BusinessCategoriesController],
  providers: [BusinessCategoriesService],
  exports: [BusinessCategoriesService, MongooseModule],
})
export class BusinessCategoriesModule {}
