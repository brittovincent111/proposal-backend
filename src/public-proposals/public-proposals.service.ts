import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';

import { DomainException } from 'src/common/errors/domain.exception';
import { ErrorCodes } from 'src/common/errors/error-codes';
import { hashToken } from 'src/common/utils/ids';
import { DocumentsService } from 'src/documents/documents.service';
import {
  DocumentRevision,
  DocumentRevisionDocument,
} from 'src/documents/schemas/document-revision.schema';
import {
  DocumentAcceptance,
  DocumentAcceptanceDocument,
  DocumentChangeRequest,
  DocumentChangeRequestDocument,
} from 'src/documents/schemas/document-response.schema';
import {
  ProposalDocument,
  ProposalDocumentDocument,
} from 'src/documents/schemas/document.schema';
import { StatusTransitionService } from 'src/documents/status-transition.service';
import { HtmlRendererService } from 'src/rendering/html-renderer.service';
import { CompiledDocument } from 'src/template-engine/document.compiler';
import { AcceptProposalDto, ChangeRequestDto } from './dto/public-proposal.dto';

export interface VisitorContext {
  ipHash: string;
  userAgent: string;
}

@Injectable()
export class PublicProposalsService {
  constructor(
    @InjectModel(ProposalDocument.name)
    private readonly documents: Model<ProposalDocumentDocument>,
    @InjectModel(DocumentRevision.name)
    private readonly revisions: Model<DocumentRevisionDocument>,
    @InjectModel(DocumentAcceptance.name)
    private readonly acceptances: Model<DocumentAcceptanceDocument>,
    @InjectModel(DocumentChangeRequest.name)
    private readonly changeRequests: Model<DocumentChangeRequestDocument>,
    private readonly transitions: StatusTransitionService,
    private readonly documentsService: DocumentsService,
    private readonly html: HtmlRendererService,
  ) {}

  /**
   * Resolves a share token to the document and the revision the customer is
   * entitled to see — map.md §34.
   *
   * Invalid, revoked and expired links are distinguished for the customer's
   * benefit but never leak whether a token merely *exists*: lookup is by hash,
   * and a wrong token simply finds nothing.
   */
  private async resolve(token: string) {
    const document = await this.documents.findOne({ 'share.tokenHash': hashToken(token) });
    if (!document) {
      throw DomainException.notFound(ErrorCodes.SHARE_LINK_INVALID, 'This link is not valid.');
    }
    if (document.share.revokedAt) {
      throw DomainException.forbidden('This link has been revoked.', ErrorCodes.SHARE_LINK_REVOKED);
    }
    if (document.share.expiresAt && document.share.expiresAt.getTime() < Date.now()) {
      throw DomainException.forbidden('This link has expired.', ErrorCodes.SHARE_LINK_EXPIRED);
    }

    // Only a revision that was actually sent is public. A newer draft revision
    // must stay invisible until the seller shares it.
    const revision = await this.revisions
      .findOne({ documentId: document._id, sentAt: { $ne: null } })
      .sort({ revisionNumber: -1 });

    if (!revision) {
      throw DomainException.notFound(
        ErrorCodes.DOCUMENT_REVISION_NOT_FOUND,
        'This proposal is not available yet.',
      );
    }

    return { document, revision };
  }

  async view(token: string, visitor: VisitorContext) {
    const { document, revision } = await this.resolve(token);

    document.share.viewCount += 1;
    document.share.lastViewedAt = new Date();
    if (!document.viewedAt) document.viewedAt = new Date();
    if (this.transitions.canTransition(document.status, 'VIEWED') && document.status === 'SENT') {
      document.status = 'VIEWED';
    }
    await document.save();

    await this.documentsService.recordEvent(document, 'VIEWED', null, revision._id, {
      ipHash: visitor.ipHash,
      userAgent: visitor.userAgent,
    });

    return this.publicPayload(document, revision);
  }

  async html_(token: string): Promise<string> {
    const { revision } = await this.resolve(token);
    // A complete page, not a fragment: the customer's browser loads this URL
    // directly (and the proposal page frames it), so it carries its own head.
    return this.html.renderPage(revision.resolvedDocumentJson as unknown as CompiledDocument);
  }

  /**
   * Records acceptance against the exact revision shown — map.md §32.
   * Accepting revision 2 must never carry over to a later revision 3.
   */
  async accept(token: string, dto: AcceptProposalDto, visitor: VisitorContext) {
    const { document, revision } = await this.resolve(token);

    if (document.status === 'ACCEPTED') {
      throw DomainException.conflict(
        ErrorCodes.DOCUMENT_ALREADY_ACCEPTED,
        'This proposal has already been accepted.',
      );
    }
    this.transitions.assertCanTransition(document.status, 'ACCEPTED');

    const acceptance = await this.acceptances.create({
      organizationId: document.organizationId,
      documentId: document._id,
      revisionId: revision._id,
      revisionNumber: revision.revisionNumber,
      customerName: dto.customerName,
      customerEmail: dto.customerEmail ?? '',
      customerComment: dto.comment ?? '',
      acceptedAt: new Date(),
      ipHash: visitor.ipHash,
      userAgent: visitor.userAgent,
    });

    document.status = 'ACCEPTED';
    document.acceptedAt = acceptance.acceptedAt;
    document.acceptedRevisionId = revision._id;
    await document.save();

    await this.documentsService.recordEvent(document, 'ACCEPTED', null, revision._id, {
      customerName: dto.customerName,
      ipHash: visitor.ipHash,
    });

    return {
      status: 'ACCEPTED',
      acceptedAt: acceptance.acceptedAt,
      revisionNumber: revision.revisionNumber,
    };
  }

  async requestChanges(token: string, dto: ChangeRequestDto, visitor: VisitorContext) {
    const { document, revision } = await this.resolve(token);

    if (document.status === 'ACCEPTED') {
      throw DomainException.conflict(
        ErrorCodes.DOCUMENT_ALREADY_ACCEPTED,
        'This proposal has already been accepted.',
      );
    }
    this.transitions.assertCanTransition(document.status, 'CHANGE_REQUESTED');

    await this.changeRequests.create({
      organizationId: document.organizationId,
      documentId: document._id,
      revisionId: revision._id,
      revisionNumber: revision.revisionNumber,
      message: dto.message,
      customerName: dto.customerName ?? '',
      ipHash: visitor.ipHash,
    });

    document.status = 'CHANGE_REQUESTED';
    await document.save();

    await this.documentsService.recordEvent(document, 'CHANGE_REQUESTED', null, revision._id, {
      ipHash: visitor.ipHash,
    });

    return { status: 'CHANGE_REQUESTED', revisionNumber: revision.revisionNumber };
  }

  /**
   * The public projection.
   *
   * Built by naming what may be exposed rather than by deleting what may not —
   * a field added to the document later cannot leak by omission (map.md §34).
   */
  private publicPayload(
    document: ProposalDocumentDocument,
    revision: DocumentRevisionDocument,
  ) {
    const resolved = revision.resolvedDocumentJson as unknown as CompiledDocument;

    return {
      documentNumber: document.documentNumber,
      title: document.title,
      status: this.transitions.effectiveStatus(document.status, document.validUntil),
      currency: document.currency,
      locale: document.locale,
      validUntil: document.validUntil,
      revisionNumber: revision.revisionNumber,
      acceptedAt: document.acceptedAt,
      canAccept: !document.acceptedAt,
      company: {
        name: document.companySnapshot.name,
        address: document.companySnapshot.address,
        phone: document.companySnapshot.phone,
        email: document.companySnapshot.email,
        website: document.companySnapshot.website,
        logoUrl: document.companySnapshot.logoUrl,
        accentColor: document.companySnapshot.accentColor,
        footerNote: document.companySnapshot.footerNote,
      },
      customer: {
        name: document.customerSnapshot.name,
        companyName: document.customerSnapshot.companyName,
      },
      blocks: resolved?.blocks ?? [],
      pricing: resolved?.pricing ?? null,
      style: resolved?.style ?? null,
      totals: {
        subtotal: revision.subtotal,
        discountTotal: revision.discountTotal,
        taxTotal: revision.taxTotal,
        grandTotal: revision.grandTotal,
      },
    };
  }
}
