import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { Package, PackageSchema } from './package.schema';
import { PackagesController } from './packages.controller';
import { PackagesService } from './packages.service';

@Module({
  imports: [MongooseModule.forFeature([{ name: Package.name, schema: PackageSchema }])],
  controllers: [PackagesController],
  providers: [PackagesService],
  exports: [PackagesService, MongooseModule],
})
export class PackagesModule {}
