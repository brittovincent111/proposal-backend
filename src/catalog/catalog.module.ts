import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { CatalogController } from './catalog.controller';
import { CatalogService } from './catalog.service';
import { Item, ItemSchema } from './item.schema';
import { TaxRate, TaxRateSchema } from './tax-rate.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Item.name, schema: ItemSchema },
      { name: TaxRate.name, schema: TaxRateSchema },
    ]),
  ],
  controllers: [CatalogController],
  providers: [CatalogService],
  exports: [CatalogService, MongooseModule],
})
export class CatalogModule {}
