import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { CatalogModule } from 'src/catalog/catalog.module';
import { CustomersModule } from 'src/customers/customers.module';
import { OrganizationsModule } from 'src/organizations/organizations.module';
import { PackagesModule } from 'src/packages/packages.module';
import { RenderingModule } from 'src/rendering/rendering.module';
import { ReusableBlocksModule } from 'src/reusable-blocks/reusable-blocks.module';
import { TemplateEngineModule } from 'src/template-engine/template-engine.module';
import { TemplatesModule } from 'src/templates/templates.module';
import { DocumentsController } from './documents.controller';
import { DocumentsService } from './documents.service';
import { NumberingService } from './numbering.service';
import { RevisionDiffService } from './revision-diff.service';
import { DocumentEvent, DocumentEventSchema } from './schemas/document-event.schema';
import {
  DocumentRevision,
  DocumentRevisionSchema,
} from './schemas/document-revision.schema';
import {
  DocumentAcceptance,
  DocumentAcceptanceSchema,
  DocumentChangeRequest,
  DocumentChangeRequestSchema,
} from './schemas/document-response.schema';
import {
  DocumentSequence,
  DocumentSequenceSchema,
} from './schemas/document-sequence.schema';
import { ProposalDocument, ProposalDocumentSchema } from './schemas/document.schema';
import { StatusTransitionService } from './status-transition.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ProposalDocument.name, schema: ProposalDocumentSchema },
      { name: DocumentRevision.name, schema: DocumentRevisionSchema },
      { name: DocumentEvent.name, schema: DocumentEventSchema },
      { name: DocumentSequence.name, schema: DocumentSequenceSchema },
      { name: DocumentAcceptance.name, schema: DocumentAcceptanceSchema },
      { name: DocumentChangeRequest.name, schema: DocumentChangeRequestSchema },
    ]),
    OrganizationsModule,
    CustomersModule,
    TemplatesModule,
    CatalogModule,
    PackagesModule,
    ReusableBlocksModule,
    TemplateEngineModule,
    RenderingModule,
  ],
  controllers: [DocumentsController],
  providers: [
    DocumentsService,
    NumberingService,
    StatusTransitionService,
    RevisionDiffService,
  ],
  exports: [
    DocumentsService,
    NumberingService,
    StatusTransitionService,
    RevisionDiffService,
    MongooseModule,
  ],
})
export class DocumentsModule {}
