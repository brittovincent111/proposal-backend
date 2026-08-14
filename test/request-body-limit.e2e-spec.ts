import { Harness, api, as, registerOrganization, startHarness, Session } from './harness';

describe('Request body limits (e2e)', () => {
  describe('default limit', () => {
    let harness: Harness;
    let owner: Session;

    beforeAll(async () => {
      harness = await startHarness();
      owner = await registerOrganization(harness, {
        email: 'owner@body-limit.test',
        organizationName: 'Body Limit Co',
      });
    });

    afterAll(async () => {
      await harness.close();
    });

    it('accepts template drafts well above Express defaults', async () => {
      const largeHtml = `<p>${'x'.repeat(150_000)}</p>`;

      const response = await as(owner)(
        api(harness).post('/templates').send({
          name: 'Large draft template',
          draft: { documentHtml: largeHtml },
        }),
      ).expect(201);

      expect(response.body.template.name).toBe('Large draft template');
      expect(response.body.draft.documentHtml.length).toBeGreaterThan(100_000);
    });
  });

  describe('configured smaller limit', () => {
    let harness: Harness;

    beforeAll(async () => {
      harness = await startHarness({ env: { REQUEST_BODY_LIMIT: '1kb' } });
    });

    afterAll(async () => {
      await harness.close();
    });

    it('returns a 413 envelope when the payload exceeds the configured limit', async () => {
      const response = await api(harness)
        .post('/auth/register')
        .send({
          email: 'owner@too-large.test',
          password: 'harness-password-123',
          organizationName: 'x'.repeat(3_000),
        })
        .expect(413);

      expect(response.body.code).toBe('PAYLOAD_TOO_LARGE');
      expect(response.body.message).toBe('Request payload is too large.');
    });
  });
});
