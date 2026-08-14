import { Types } from 'mongoose';

import { hashToken } from 'src/common/utils/ids';
import { CredentialTokenDocument, CredentialTokenPurpose } from './credential-token.schema';
import { CredentialsService } from './credentials.service';

/**
 * A minimal in-memory stand-in for the Mongoose model. It models the two
 * behaviours the service depends on: `updateMany` retiring earlier tokens, and
 * `findOneAndUpdate` claiming a row only when it still matches the filter — which
 * is what makes a link single-use.
 */
class FakeTokens {
  rows: Array<Record<string, unknown>> = [];

  create(row: Record<string, unknown>) {
    this.rows.push({ ...row, usedAt: row.usedAt ?? null });
    return Promise.resolve(row);
  }

  updateMany(filter: Record<string, unknown>, update: Record<string, unknown>) {
    const set = (update.$set ?? {}) as Record<string, unknown>;
    for (const row of this.rows) {
      if (this.matches(row, filter)) Object.assign(row, set);
    }
    return Promise.resolve({ acknowledged: true });
  }

  findOneAndUpdate(filter: Record<string, unknown>, update: Record<string, unknown>) {
    const set = (update.$set ?? {}) as Record<string, unknown>;
    const row = this.rows.find((candidate) => this.matches(candidate, filter));
    if (!row) return Promise.resolve(null);
    Object.assign(row, set);
    return Promise.resolve(row as unknown as CredentialTokenDocument);
  }

  private matches(row: Record<string, unknown>, filter: Record<string, unknown>): boolean {
    return Object.entries(filter).every(([key, expected]) => {
      const actual = row[key];
      if (expected && typeof expected === 'object' && '$gt' in (expected as object)) {
        const bound = (expected as { $gt: Date }).$gt;
        return actual instanceof Date && actual.getTime() > bound.getTime();
      }
      if (expected instanceof Types.ObjectId) return String(actual) === String(expected);
      return actual === expected;
    });
  }
}

describe('CredentialsService', () => {
  const userId = new Types.ObjectId();
  let fake: FakeTokens;
  let service: CredentialsService;

  beforeEach(() => {
    fake = new FakeTokens();
    service = new CredentialsService(fake as never);
  });

  const issue = (purpose: CredentialTokenPurpose = 'PASSWORD_RESET') =>
    service.issue({ userId, purpose });

  it('stores only the hash of the token it returns', async () => {
    const { token } = await issue();

    expect(fake.rows).toHaveLength(1);
    expect(fake.rows[0].tokenHash).toBe(hashToken(token));
    expect(JSON.stringify(fake.rows[0])).not.toContain(token);
  });

  it('consumes a valid token once', async () => {
    const { token } = await issue();

    await expect(service.consume(token, 'PASSWORD_RESET')).resolves.toMatchObject({ userId });
    await expect(service.consume(token, 'PASSWORD_RESET')).rejects.toThrow(
      'This link is no longer valid. Ask for a new one.',
    );
  });

  it('retires an earlier unused token of the same purpose', async () => {
    const first = await issue();
    const second = await issue();

    await expect(service.consume(first.token, 'PASSWORD_RESET')).rejects.toThrow();
    await expect(service.consume(second.token, 'PASSWORD_RESET')).resolves.toBeTruthy();
  });

  it('keeps purposes apart', async () => {
    const reset = await issue('PASSWORD_RESET');
    const invite = await issue('INVITE');

    await expect(service.consume(reset.token, 'INVITE')).rejects.toThrow();
    await expect(service.consume(invite.token, 'PASSWORD_RESET')).rejects.toThrow();
    await expect(service.consume(invite.token, 'INVITE')).resolves.toBeTruthy();
  });

  it('rejects an expired token', async () => {
    const { token } = await issue();
    fake.rows[0].expiresAt = new Date(Date.now() - 1000);

    await expect(service.consume(token, 'PASSWORD_RESET')).rejects.toThrow();
  });

  it('rejects an unknown token without saying why', async () => {
    await expect(service.consume('not-a-real-token', 'PASSWORD_RESET')).rejects.toThrow(
      'This link is no longer valid. Ask for a new one.',
    );
  });

  it('gives an invite a longer life than a reset', async () => {
    const reset = await issue('PASSWORD_RESET');
    const invite = await issue('INVITE');

    expect(invite.expiresAt.getTime()).toBeGreaterThan(reset.expiresAt.getTime());
  });
});
