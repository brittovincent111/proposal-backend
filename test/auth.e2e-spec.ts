import { Harness, api, as, registerOrganization, startHarness, Session } from './harness';

describe('Authentication (e2e)', () => {
  let harness: Harness;
  let owner: Session;

  beforeAll(async () => {
    harness = await startHarness();
    owner = await registerOrganization(harness, {
      email: 'owner@auth.test',
      organizationName: 'Auth Co',
      password: 'harness-password-123',
    });
  });

  afterAll(async () => {
    await harness.close();
  });

  it('sets httpOnly session cookies and a readable CSRF cookie', async () => {
    const response = await api(harness)
      .post('/auth/login')
      .send({ email: 'owner@auth.test', password: 'harness-password-123' })
      .expect(200);

    const cookies = response.headers['set-cookie'] as unknown as string[];
    const access = cookies.find((cookie) => cookie.startsWith('qtn_access='));
    const csrf = cookies.find((cookie) => cookie.startsWith('qtn_csrf='));

    expect(access).toContain('HttpOnly');
    // The CSRF cookie is deliberately readable — that is how the header is set.
    expect(csrf).not.toContain('HttpOnly');
  });

  it('never returns the password hash', async () => {
    const response = await as(owner)(api(harness).get('/auth/me')).expect(200);
    expect(JSON.stringify(response.body)).not.toContain('passwordHash');
    expect(response.body.user.email).toBe('owner@auth.test');
  });

  it('gives the same error for a wrong password and an unknown account', async () => {
    const wrongPassword = await api(harness)
      .post('/auth/login')
      .send({ email: 'owner@auth.test', password: 'not-the-password' })
      .expect(401);

    const unknownUser = await api(harness)
      .post('/auth/login')
      .send({ email: 'nobody@auth.test', password: 'not-the-password' })
      .expect(401);

    expect(wrongPassword.body.code).toBe('INVALID_CREDENTIALS');
    expect(unknownUser.body).toEqual(wrongPassword.body);
  });

  it('refuses to register the same email twice', async () => {
    const response = await api(harness)
      .post('/auth/register')
      .send({
        email: 'owner@auth.test',
        password: 'another-password-123',
        organizationName: 'Impostor Co',
      })
      .expect(409);

    expect(response.body.code).toBe('EMAIL_ALREADY_REGISTERED');
  });

  it('rejects a cookie-authenticated write without the CSRF header', async () => {
    const response = await api(harness)
      .post('/customers')
      .set('Cookie', owner.cookies)
      .set('x-organization-id', owner.organizationId)
      .send({ name: 'Forged' })
      .expect(403);

    expect(response.body.code).toBe('CSRF_TOKEN_INVALID');
  });

  it('rotates the refresh token and invalidates the old one', async () => {
    const login = await api(harness)
      .post('/auth/login')
      .send({ email: 'owner@auth.test', password: 'harness-password-123' })
      .expect(200);

    const first = (login.headers['set-cookie'] as unknown as string[]).map((c) => c.split(';')[0]);

    const refreshed = await api(harness).post('/auth/refresh').set('Cookie', first).expect(200);
    expect(refreshed.body.user.email).toBe('owner@auth.test');

    // Replaying the consumed token must fail — that is the reuse detection.
    const replay = await api(harness).post('/auth/refresh').set('Cookie', first).expect(401);
    expect(replay.body.code).toBe('REFRESH_TOKEN_INVALID');
  });

  it('clears cookies on logout', async () => {
    const login = await api(harness)
      .post('/auth/login')
      .send({ email: 'owner@auth.test', password: 'harness-password-123' })
      .expect(200);
    const cookies = (login.headers['set-cookie'] as unknown as string[]).map((c) => c.split(';')[0]);

    await api(harness).post('/auth/logout').set('Cookie', cookies).expect(204);
    await api(harness).post('/auth/refresh').set('Cookie', cookies).expect(401);
  });

  it('validates the registration payload', async () => {
    const response = await api(harness)
      .post('/auth/register')
      .send({ email: 'not-an-email', password: 'short', organizationName: '' })
      .expect(400);

    expect(response.body.code).toBe('VALIDATION_FAILED');
    expect(response.body.details.length).toBeGreaterThan(0);
  });
});
