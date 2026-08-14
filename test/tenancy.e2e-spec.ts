import { Harness, api, as, registerOrganization, startHarness, Session } from './harness';

/**
 * map.md §86 — the edge cases that must hold before anything else matters.
 * Organization A must not be able to see, guess at, or act on B's data.
 */
describe('Tenant isolation (e2e)', () => {
  let harness: Harness;
  let abc: Session;
  let xyz: Session;
  let abcCustomerId: string;

  beforeAll(async () => {
    harness = await startHarness();
    abc = await registerOrganization(harness, {
      email: 'owner@abc.test',
      organizationName: 'ABC Travels',
    });
    xyz = await registerOrganization(harness, {
      email: 'owner@xyz.test',
      organizationName: 'XYZ Interiors',
    });

    const created = await as(abc)(
      api(harness).post('/customers').send({ name: 'Ravi Menon', email: 'ravi@example.test' }),
    ).expect(201);
    abcCustomerId = created.body._id;
  });

  afterAll(async () => {
    await harness.close();
  });

  it('gives each organization its own provisioned defaults', async () => {
    const abcRates = await as(abc)(api(harness).get('/tax-rates')).expect(200);
    const xyzRates = await as(xyz)(api(harness).get('/tax-rates')).expect(200);

    expect(abcRates.body.length).toBeGreaterThan(0);
    expect(abcRates.body[0]._id).not.toBe(xyzRates.body[0]._id);
  });

  it('hides one organization\'s customers from another', async () => {
    const list = await as(xyz)(api(harness).get('/customers')).expect(200);
    expect(list.body.data).toHaveLength(0);
  });

  it('returns 404 — not 403 — when reading another organization\'s record by id', async () => {
    // Leaking "exists but forbidden" would confirm the id is real.
    const response = await as(xyz)(api(harness).get(`/customers/${abcCustomerId}`)).expect(404);
    expect(response.body.code).toBe('CUSTOMER_NOT_FOUND');
  });

  it('returns the same 404 for a malformed id', async () => {
    const response = await as(xyz)(api(harness).get('/customers/not-an-object-id')).expect(404);
    expect(response.body.code).toBe('CUSTOMER_NOT_FOUND');
  });

  it('refuses to act in an organization the caller does not belong to', async () => {
    const response = await api(harness)
      .get('/customers')
      .set('Cookie', xyz.cookies)
      .set('x-organization-id', abc.organizationId)
      .expect(403);

    expect(response.body.code).toBe('INSUFFICIENT_PERMISSION');
  });

  it('cannot be told which organization to use through the request body', async () => {
    // organizationId is never accepted from the client — the DTO rejects it.
    const response = await as(xyz)(
      api(harness)
        .post('/customers')
        .send({ name: 'Injected', organizationId: abc.organizationId }),
    ).expect(400);

    expect(response.body.code).toBe('VALIDATION_FAILED');
  });

  it('rejects an unauthenticated request', async () => {
    const response = await api(harness).get('/customers').expect(401);
    expect(response.body.code).toBe('AUTHENTICATION_REQUIRED');
  });
});
