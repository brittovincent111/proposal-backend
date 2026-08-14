import { Injectable } from '@nestjs/common';

import { DomainException } from 'src/common/errors/domain.exception';
import { ErrorCodes } from 'src/common/errors/error-codes';
import { DocumentStatus } from './schemas/document.schema';

/**
 * The document lifecycle — map.md §67.
 *
 * Controllers never assign `status` directly; every change goes through
 * `assertCanTransition`, so an illegal jump (ACCEPTED → DRAFT) is impossible
 * rather than merely discouraged.
 */
const ALLOWED: Record<DocumentStatus, DocumentStatus[]> = {
  DRAFT: ['PENDING_APPROVAL', 'APPROVED', 'SENT', 'CANCELLED'],
  PENDING_APPROVAL: ['APPROVED', 'DRAFT', 'CANCELLED'],
  APPROVED: ['SENT', 'DRAFT', 'CANCELLED'],
  SENT: ['VIEWED', 'CHANGE_REQUESTED', 'ACCEPTED', 'REJECTED', 'EXPIRED', 'CANCELLED'],
  VIEWED: ['CHANGE_REQUESTED', 'ACCEPTED', 'REJECTED', 'EXPIRED', 'CANCELLED'],
  // A change request is answered with a new revision, which resets to DRAFT.
  CHANGE_REQUESTED: ['DRAFT', 'SENT', 'CANCELLED', 'EXPIRED'],
  REJECTED: ['DRAFT', 'CANCELLED'],
  EXPIRED: ['DRAFT', 'CANCELLED'],
  ACCEPTED: [],
  CANCELLED: [],
};

/** Statuses whose content the operator may still edit. */
const EDITABLE: DocumentStatus[] = ['DRAFT', 'PENDING_APPROVAL', 'APPROVED'];

@Injectable()
export class StatusTransitionService {
  canTransition(from: DocumentStatus, to: DocumentStatus): boolean {
    return from === to || ALLOWED[from].includes(to);
  }

  assertCanTransition(from: DocumentStatus, to: DocumentStatus): void {
    if (!this.canTransition(from, to)) {
      throw DomainException.invalid(
        ErrorCodes.INVALID_STATUS_TRANSITION,
        `A ${from.toLowerCase().replace('_', ' ')} document cannot move to ${to
          .toLowerCase()
          .replace('_', ' ')}.`,
      );
    }
  }

  isEditable(status: DocumentStatus): boolean {
    return EDITABLE.includes(status);
  }

  assertEditable(status: DocumentStatus): void {
    if (status === 'ACCEPTED') {
      throw DomainException.invalid(
        ErrorCodes.DOCUMENT_ALREADY_ACCEPTED,
        'This document has been accepted by the customer and can no longer be edited.',
      );
    }
    if (!this.isEditable(status)) {
      throw DomainException.invalid(
        ErrorCodes.DOCUMENT_NOT_EDITABLE,
        'This document has already been shared. Create a new revision to change it.',
      );
    }
  }

  /** map.md §69 — expiry is decided at read time, not by a background job. */
  effectiveStatus(status: DocumentStatus, validUntil: Date, now = new Date()): DocumentStatus {
    const expirable: DocumentStatus[] = ['SENT', 'VIEWED', 'CHANGE_REQUESTED'];
    if (expirable.includes(status) && validUntil.getTime() < now.getTime()) return 'EXPIRED';
    return status;
  }
}
