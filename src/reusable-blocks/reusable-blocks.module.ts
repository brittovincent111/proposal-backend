import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { ReusableBlock, ReusableBlockSchema } from './reusable-block.schema';
import { ReusableBlocksController } from './reusable-blocks.controller';
import { ReusableBlocksService } from './reusable-blocks.service';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: ReusableBlock.name, schema: ReusableBlockSchema }]),
  ],
  controllers: [ReusableBlocksController],
  providers: [ReusableBlocksService],
  exports: [ReusableBlocksService, MongooseModule],
})
export class ReusableBlocksModule {}
