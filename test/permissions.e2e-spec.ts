import { Harness, Session, api, as, registerOrganization, startHarness } from './harness';

/** map.md §86 — "Unauthorized staff modifies master template" must not be possible. */
describe('Permissions (e2e)', () => {
  let harness: Harness;
  let owner: Session;
  let staff: Session;
  let templateId: string;

  beforeAll(async () => {
    harness = await startHarness();

    owner = await registerOrganization(harness, {
      email: 'owner@perm.test',
      organizationName: 'Permission Co',
    });

    // The staff member registers their own account, then is invited into the org.
    staff = await registerOrganization(harness, {
      email: 'staff@perm.test',
      organizationName: 'Staff Personal Org',
    });

    await as(owner)(
      api(harness).post('/members/invite').send({ email: 'staff@perm.test', role: 'STAFF' }),
    ).expect(201);

    // Act inside the owner's organization from now on.
    staff = { ...staff, organizationId: owner.organizationId };

    const template = await as(owner)(
      api(harness).post('/templates').send({ name: 'Master template' }),
    ).expect(201);
    templateId = template.body.template._id;
  });

  afterAll(async () => {
    await harness.close();
  });

  it('lets staff read templates', async () => {
    await as(staff)(api(harness).get('/templates')).expect(200);
  });

  it('stops staff editing the master template', async () => {
    const response = await as(staff)(
      api(harness).patch(`/templates/${templateId}`).send({ name: 'Hijacked' }),
    ).expect(403);

    expect(response.body.code).toBe('INSUFFICIENT_PERMISSION');
    expect(response.body.message).toContain('STAFF');
  });

  it('stops staff publishing a template', async () => {
    await as(staff)(api(harness).post(`/templates/${templateId}/publish`).send({})).expect(403);
  });

  it('stops staff managing the team', async () => {
    await as(staff)(api(harness).get('/members')).expect(403);
  });

  it('stops staff changing organization settings', async () => {
    await as(staff)(
      api(harness).patch('/organizations/current/settings').send({ documentPrefix: 'X' }),
    ).expect(403);
  });

  it('lets staff create documents and customers', async () => {
    await as(staff)(api(harness).post('/customers').send({ name: 'Walk-in enquiry' })).expect(201);
    await as(staff)(api(harness).post('/documents').send({})).expect(201);
  });

  it('protects the last owner from being demoted', async () => {
    const members = await as(owner)(api(harness).get('/members')).expect(200);
    const ownerMember = members.body.find(
      (member: { role: string }) => member.role === 'OWNER',
    );

    const response = await as(owner)(
      api(harness).patch(`/members/${ownerMember.id}/role`).send({ role: 'VIEWER' }),
    ).expect(422);

    expect(response.body.code).toBe('LAST_OWNER_PROTECTED');
  });

  it('lets an owner change a staff member\'s role', async () => {
    const members = await as(owner)(api(harness).get('/members')).expect(200);
    const staffMember = members.body.find((member: { role: string }) => member.role === 'STAFF');

    const response = await as(owner)(
      api(harness).patch(`/members/${staffMember.id}/role`).send({ role: 'MANAGER' }),
    ).expect(200);

    expect(response.body.role).toBe('MANAGER');
  });

  it('applies the new role immediately', async () => {
    // The tenant context is resolved per request, so no re-login is needed.
    await as(staff)(api(harness).get('/members')).expect(403);
    await as(staff)(api(harness).post(`/templates/${templateId}/validate`)).expect(201);
  });
});
