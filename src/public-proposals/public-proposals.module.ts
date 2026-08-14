import { Module } from '@nestjs/common';

import { DocumentsModule } from 'src/documents/documents.module';
import { RenderingModule } from 'src/rendering/rendering.module';
import { PublicProposalsController } from './public-proposals.controller';
import { PublicProposalsService } from './public-proposals.service';

@Module({
  imports: [DocumentsModule, RenderingModule],
  controllers: [PublicProposalsController],
  providers: [PublicProposalsService],
})
export class PublicProposalsModule {}
