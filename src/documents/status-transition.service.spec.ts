import { DomainException } from 'src/common/errors/domain.exception';
import { StatusTransitionService } from './status-transition.service';

describe('StatusTransitionService', () => {
  const transitions = new StatusTransitionService();

  it('follows the happy path through the lifecycle', () => {
    expect(transitions.canTransition('DRAFT', 'PENDING_APPROVAL')).toBe(true);
    expect(transitions.canTransition('PENDING_APPROVAL', 'APPROVED')).toBe(true);
    expect(transitions.canTransition('APPROVED', 'SENT')).toBe(true);
    expect(transitions.canTransition('SENT', 'VIEWED')).toBe(true);
    expect(transitions.canTransition('VIEWED', 'ACCEPTED')).toBe(true);
  });

  it('refuses to walk an accepted document backwards', () => {
    // map.md §67 names this exact case.
    expect(transitions.canTransition('ACCEPTED', 'DRAFT')).toBe(false);
    expect(() => transitions.assertCanTransition('ACCEPTED', 'DRAFT')).toThrow(DomainException);
  });

  it('allows a change request to become a new draft', () => {
    expect(transitions.canTransition('SENT', 'CHANGE_REQUESTED')).toBe(true);
    expect(transitions.canTransition('CHANGE_REQUESTED', 'DRAFT')).toBe(true);
  });

  it('treats a no-op transition as allowed', () => {
    expect(transitions.canTransition('SENT', 'SENT')).toBe(true);
  });

  it('only lets pre-send statuses be edited', () => {
    expect(transitions.isEditable('DRAFT')).toBe(true);
    expect(transitions.isEditable('APPROVED')).toBe(true);
    expect(transitions.isEditable('SENT')).toBe(false);
  });

  it('reports acceptance separately from ordinary immutability', () => {
    expect(() => transitions.assertEditable('ACCEPTED')).toThrow(
      expect.objectContaining({ code: 'DOCUMENT_ALREADY_ACCEPTED' }),
    );
    expect(() => transitions.assertEditable('SENT')).toThrow(
      expect.objectContaining({ code: 'DOCUMENT_NOT_EDITABLE' }),
    );
  });

  it('reports expiry at read time without mutating state', () => {
    const past = new Date('2020-01-01');
    const future = new Date('2999-01-01');

    expect(transitions.effectiveStatus('SENT', past)).toBe('EXPIRED');
    expect(transitions.effectiveStatus('SENT', future)).toBe('SENT');
    // An accepted document does not expire.
    expect(transitions.effectiveStatus('ACCEPTED', past)).toBe('ACCEPTED');
    expect(transitions.effectiveStatus('DRAFT', past)).toBe('DRAFT');
  });
});
