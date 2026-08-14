import { SEED_TEMPLATE } from 'src/seed/seed.data';
import { Harness, Session, api, as, registerOrganization, startHarness } from './harness';

/**
 * The product's core promise end to end: publish a template once, answer a few
 * questions, and get a document that stays exactly as the customer saw it.
 */
describe('Document lifecycle (e2e)', () => {
  let harness: Harness;
  let owner: Session;
  let templateId: string;
  let customerId: string;
  let packageId: string;

  const call = () => api(harness);

  beforeAll(async () => {
    harness = await startHarness();
    owner = await registerOrganization(harness, {
      email: 'owner@lifecycle.test',
      organizationName: 'Lifecycle Travels',
    });

    const customer = await as(owner)(
      call().post('/customers').send({ name: 'Ravi Menon', email: 'ravi@example.test' }),
    ).expect(201);
    customerId = customer.body._id;

    const item = await as(owner)(
      call().post('/items').send({ name: 'Deluxe room', unit: 'night', defaultRate: 380_000 }),
    ).expect(201);

    const pkg = await as(owner)(
      call()
        .post('/packages')
        .send({
          name: 'Munnar 3N',
          lines: [
            { itemId: item.body._id, name: 'Deluxe room', unit: 'night', quantity: 3, rate: 380_000 },
            { name: 'Plantation tour', unit: 'nos', quantity: 1, rate: 150_000, optional: true },
          ],
        }),
    ).expect(201);
    packageId = pkg.body._id;
    await as(owner)(call().post(`/packages/${packageId}/publish`)).expect(201);

    const template = await as(owner)(
      call()
        .post('/templates')
        .send({
          name: SEED_TEMPLATE.name,
          industry: 'Travel',
          draft: {
            schemaJson: SEED_TEMPLATE.schemaJson,
            fieldSchemaJson: SEED_TEMPLATE.fieldSchemaJson,
          },
        }),
    ).expect(201);
    templateId = template.body.template._id;
  });

  afterAll(async () => {
    await harness.close();
  });

  describe('templates', () => {
    it('refuses to create a document from an unpublished template', async () => {
      const response = await as(owner)(
        call().post('/documents').send({ templateId, customerId }),
      ).expect(422);
      expect(response.body.code).toBe('TEMPLATE_NOT_PUBLISHED');
    });

    it('reports validation errors before publish', async () => {
      const report = await as(owner)(call().post(`/templates/${templateId}/validate`)).expect(201);
      expect(report.body.valid).toBe(true);
    });

    it('refuses to publish a template whose formula references a missing field', async () => {
      const broken = await as(owner)(
        call().post('/templates').send({ name: 'Broken' }),
      ).expect(201);
      const brokenId = broken.body.template._id;

      await as(owner)(
        call()
          .patch(`/templates/${brokenId}/draft/fields`)
          .send({
            fieldSchemaJson: {
              fields: [],
              formulas: [{ id: 'x', key: 'total', label: '', expression: 'deleted_field * 2' }],
            },
          }),
      ).expect(200);

      const response = await as(owner)(call().post(`/templates/${brokenId}/publish`).send({})).expect(422);
      expect(response.body.code).toBe('TEMPLATE_SCHEMA_INVALID');
    });

    it('publishes and freezes a version', async () => {
      const published = await as(owner)(
        call().post(`/templates/${templateId}/publish`).send({ changeNote: 'v1' }),
      ).expect(201);

      expect(published.body.template.status).toBe('PUBLISHED');
      expect(published.body.version.publishedAt).not.toBeNull();
    });
  });

  describe('creation and pricing', () => {
    let documentId: string;
    let documentNumber: string;

    it('creates a draft with a snapshot of the customer and a document number', async () => {
      const response = await as(owner)(
        call()
          .post('/documents')
          .send({
            templateId,
            customerId,
            answers: {
              destination: 'Munnar',
              travel_date: '2026-09-12',
              nights: 3,
              adults: 2,
              children: 1,
              hotel_category: 'Deluxe',
            },
          }),
      ).expect(201);

      documentId = response.body._id;
      documentNumber = response.body.documentNumber;

      expect(documentNumber).toMatch(/^Q-\d{4}-\d{5}$/);
      expect(response.body.customerSnapshot.name).toBe('Ravi Menon');
      expect(response.body.status).toBe('DRAFT');
    });

    it('computes totals server-side when a package is added', async () => {
      const response = await as(owner)(
        call().post(`/documents/${documentId}/packages`).send({ packageId }),
      ).expect(201);

      // 3 × ₹3,800 = ₹11,400; the optional tour is quoted but not counted.
      expect(response.body.draftTotals.subtotal).toBe(1_140_000);
      expect(response.body.draftTotals.optionalTotal).toBe(150_000);
    });

    it('ignores a client-supplied total', async () => {
      const response = await as(owner)(
        call()
          .patch(`/documents/${documentId}`)
          .send({ title: 'Kerala trip', draftTotals: { grandTotal: 1 } }),
      ).expect(400);
      expect(response.body.code).toBe('VALIDATION_FAILED');
    });

    it('rejects a stale edit', async () => {
      const current = await as(owner)(call().get(`/documents/${documentId}`)).expect(200);

      await as(owner)(
        call()
          .patch(`/documents/${documentId}`)
          .send({ title: 'First writer wins', expectedVersion: current.body.version }),
      ).expect(200);

      const response = await as(owner)(
        call()
          .patch(`/documents/${documentId}`)
          .send({ title: 'Second writer loses', expectedVersion: current.body.version }),
      ).expect(409);

      expect(response.body.code).toBe('CONCURRENT_EDIT_CONFLICT');
    });

    it('refuses to generate while a required answer is missing', async () => {
      const incomplete = await as(owner)(
        call().post('/documents').send({ templateId, customerId, answers: { destination: 'Kochi' } }),
      ).expect(201);

      const response = await as(owner)(
        call().post(`/documents/${incomplete.body._id}/generate`),
      ).expect(422);

      expect(response.body.code).toBe('FIELD_REQUIRED');
      expect(response.body.details.map((issue: { path: string }) => issue.path)).toContain('nights');
    });

    it('generates a revision that resolves variables and conditions', async () => {
      const revision = await as(owner)(call().post(`/documents/${documentId}/generate`)).expect(201);

      expect(revision.body.revisionNumber).toBe(1);
      expect(revision.body.grandTotal).toBeGreaterThan(0);

      const blocks = revision.body.resolvedDocumentJson.blocks as Array<{
        id: string;
        content: string;
      }>;
      // total_guests = adults + children = 3, and the pickup block stays hidden.
      expect(blocks.find((block) => block.id === 'b1')?.content).toContain('3 guests');
      expect(blocks.find((block) => block.id === 'b4')).toBeUndefined();
    });

    it('renders the document as sanitised HTML', async () => {
      const response = await as(owner)(call().get(`/documents/${documentId}/preview`)).expect(200);
      expect(response.text).toContain('qtn-document');
      expect(response.text).toContain('Munnar');
      expect(response.text).not.toContain('<script');
    });

    it('keeps history when the master template changes afterwards', async () => {
      // map.md §116: editing and republishing the template must not touch a
      // document that was generated from the earlier version.
      const before = await as(owner)(call().get(`/documents/${documentId}`)).expect(200);

      await as(owner)(
        call()
          .patch(`/templates/${templateId}/draft/schema`)
          .send({
            schemaJson: {
              blocks: [
                {
                  id: 'b1',
                  type: 'heading',
                  label: 'Title',
                  content: 'COMPLETELY DIFFERENT TEMPLATE',
                  items: [],
                },
              ],
            },
          }),
      ).expect(200);
      await as(owner)(call().post(`/templates/${templateId}/publish`).send({})).expect(201);

      const revisions = await as(owner)(call().get(`/documents/${documentId}/revisions`)).expect(200);
      const revision = await as(owner)(
        call().get(`/documents/${documentId}/revisions/${revisions.body[0]._id}`),
      ).expect(200);

      const blocks = revision.body.resolvedDocumentJson.blocks as Array<{ content: string }>;
      expect(blocks.some((block) => block.content.includes('COMPLETELY DIFFERENT'))).toBe(false);
      expect(before.body.templateVersionId).toBeDefined();
    });

    it('keeps history when the package price changes afterwards', async () => {
      // map.md §117.
      await as(owner)(
        call()
          .patch(`/packages/${packageId}`)
          .send({
            lines: [{ name: 'Deluxe room', unit: 'night', quantity: 3, rate: 999_999 }],
          }),
      ).expect(200);

      const document = await as(owner)(call().get(`/documents/${documentId}`)).expect(200);
      expect(document.body.draftTotals.subtotal).toBe(1_140_000);
    });
  });

  describe('sending, revisions and acceptance', () => {
    let documentId: string;
    let shareToken: string;

    beforeAll(async () => {
      const created = await as(owner)(
        call()
          .post('/documents')
          .send({
            templateId,
            customerId,
            answers: {
              destination: 'Alleppey',
              travel_date: '2026-10-02',
              nights: 2,
              adults: 2,
              children: 0,
              hotel_category: 'Luxury',
            },
          }),
      ).expect(201);
      documentId = created.body._id;

      await as(owner)(call().post(`/documents/${documentId}/packages`).send({ packageId })).expect(201);
      await as(owner)(call().post(`/documents/${documentId}/generate`)).expect(201);
    });

    it('returns the share token exactly once on send', async () => {
      const response = await as(owner)(
        call().post(`/documents/${documentId}/send`).send({}),
      ).expect(201);

      shareToken = response.body.shareToken;
      expect(shareToken).toHaveLength(43);
      expect(response.body.status).toBe('SENT');

      // Only the hash is persisted.
      const stored = await harness.connection
        .collection('documents')
        .findOne({ documentNumber: (await as(owner)(call().get(`/documents/${documentId}`))).body.documentNumber });
      expect(stored?.share?.tokenHash).not.toBe(shareToken);
    });

    it('refuses to edit a sent document', async () => {
      const response = await as(owner)(
        call().patch(`/documents/${documentId}`).send({ title: 'Sneaky edit' }),
      ).expect(422);
      expect(response.body.code).toBe('DOCUMENT_NOT_EDITABLE');
    });

    it('refuses to overwrite a sent revision', async () => {
      const response = await as(owner)(call().post(`/documents/${documentId}/generate`)).expect(422);
      expect(response.body.code).toBe('DOCUMENT_REVISION_IMMUTABLE');
    });

    it('serves the proposal publicly without authentication', async () => {
      const response = await call().get(`/public/proposals/${shareToken}`).expect(200);

      expect(response.body.documentNumber).toBeDefined();
      expect(response.body.revisionNumber).toBe(1);
      // Nothing internal may cross the boundary.
      const payload = JSON.stringify(response.body);
      expect(payload).not.toContain('internalNotes');
      expect(payload).not.toContain('createdById');
      expect(payload).not.toContain('organizationId');
    });

    it('rejects an unknown share token', async () => {
      const response = await call().get('/public/proposals/not-a-real-token').expect(404);
      expect(response.body.code).toBe('SHARE_LINK_INVALID');
    });

    it('records a customer change request and unlocks a new revision', async () => {
      await call()
        .post(`/public/proposals/${shareToken}/change-request`)
        .send({ message: 'Please quote a standard room instead.', customerName: 'Ravi' })
        .expect(201);

      const document = await as(owner)(call().get(`/documents/${documentId}`)).expect(200);
      expect(document.body.status).toBe('CHANGE_REQUESTED');

      const revision = await as(owner)(
        call().post(`/documents/${documentId}/revisions`).send({ reason: 'Customer asked for standard rooms' }),
      ).expect(201);

      expect(revision.body.revisionNumber).toBe(2);
      expect(revision.body.changeSummaryJson.reason).toContain('standard rooms');
    });

    it('keeps showing the sent revision until the new one is sent', async () => {
      const response = await call().get(`/public/proposals/${shareToken}`).expect(200);
      expect(response.body.revisionNumber).toBe(1);
    });

    it('pins acceptance to the exact revision the customer saw', async () => {
      const response = await call()
        .post(`/public/proposals/${shareToken}/accept`)
        .send({ customerName: 'Ravi Menon', customerEmail: 'ravi@example.test' })
        .expect(201);

      expect(response.body.revisionNumber).toBe(1);

      const acceptance = await harness.connection
        .collection('document_acceptances')
        .findOne({ customerName: 'Ravi Menon' });
      expect(acceptance?.revisionNumber).toBe(1);
    });

    it('refuses a second acceptance', async () => {
      const response = await call()
        .post(`/public/proposals/${shareToken}/accept`)
        .send({ customerName: 'Someone Else' })
        .expect(409);
      expect(response.body.code).toBe('DOCUMENT_ALREADY_ACCEPTED');
    });

    it('will not revise an accepted document', async () => {
      const response = await as(owner)(
        call().post(`/documents/${documentId}/revisions`).send({}),
      ).expect(422);
      expect(response.body.code).toBe('DOCUMENT_ALREADY_ACCEPTED');
    });

    it('stops serving a revoked link', async () => {
      await as(owner)(call().post(`/documents/${documentId}/share/revoke`)).expect(201);
      const response = await call().get(`/public/proposals/${shareToken}`).expect(403);
      expect(response.body.code).toBe('SHARE_LINK_REVOKED');
    });

    it('records the timeline', async () => {
      const events = await as(owner)(call().get(`/documents/${documentId}/events`)).expect(200);
      const types = events.body.map((event: { eventType: string }) => event.eventType);

      expect(types).toEqual(expect.arrayContaining(['CREATED', 'SENT', 'VIEWED', 'CHANGE_REQUESTED', 'ACCEPTED']));
    });

    it('reports that PDF rendering is not configured rather than faking one', async () => {
      const response = await as(owner)(call().get(`/documents/${documentId}/pdf`)).expect(501);
      expect(response.body.code).toBe('PDF_RENDERER_NOT_CONFIGURED');
    });
  });

  describe('numbering', () => {
    it('gives concurrent creates distinct numbers', async () => {
      // map.md §30, §86 — the case that breaks a MAX(number)+1 implementation.
      const responses = await Promise.all(
        Array.from({ length: 12 }, () =>
          as(owner)(call().post('/documents').send({ customerId })),
        ),
      );

      const numbers = responses.map((response) => response.body.documentNumber);
      expect(responses.every((response) => response.status === 201)).toBe(true);
      expect(new Set(numbers).size).toBe(numbers.length);
    });
  });
});
