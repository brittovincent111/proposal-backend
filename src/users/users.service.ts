import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import * as argon2 from 'argon2';
import { Model, Types } from 'mongoose';

import { User, UserDocument } from './user.schema';

/**
 * Argon2id with parameters that stay comfortable on a small VPS — map.md §93
 * targets low-cost hosting, so this is tuned for ~50ms rather than maximum cost.
 */
const ARGON_OPTIONS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
};

@Injectable()
export class UsersService {
  constructor(@InjectModel(User.name) private readonly users: Model<UserDocument>) {}

  hashPassword(password: string): Promise<string> {
    return argon2.hash(password, ARGON_OPTIONS);
  }

  async verifyPassword(hash: string | null, password: string): Promise<boolean> {
    if (!hash) return false;
    try {
      return await argon2.verify(hash, password);
    } catch {
      // A corrupt or foreign-format hash is a failed login, not a 500.
      return false;
    }
  }

  findByEmail(email: string): Promise<UserDocument | null> {
    return this.users.findOne({ email: email.toLowerCase().trim() }).exec();
  }

  findById(id: string | Types.ObjectId): Promise<UserDocument | null> {
    return this.users.findById(id).exec();
  }

  async create(input: {
    email: string;
    password?: string;
    firstName?: string;
    lastName?: string;
    status?: 'ACTIVE' | 'INVITED';
  }): Promise<UserDocument> {
    return this.users.create({
      email: input.email.toLowerCase().trim(),
      passwordHash: input.password ? await this.hashPassword(input.password) : null,
      firstName: input.firstName ?? '',
      lastName: input.lastName ?? '',
      status: input.status ?? 'ACTIVE',
    });
  }

  async touchLogin(id: Types.ObjectId): Promise<void> {
    await this.users.updateOne({ _id: id }, { $set: { lastLoginAt: new Date() } });
  }

  /**
   * Replaces a password and activates the account.
   *
   * Used by both password reset and invite acceptance — an invited user has no
   * hash until they set one, which is the same write.
   */
  async setPassword(id: Types.ObjectId, password: string): Promise<void> {
    await this.users.updateOne(
      { _id: id },
      { $set: { passwordHash: await this.hashPassword(password), status: 'ACTIVE' } },
    );
  }

  async updateName(id: Types.ObjectId, firstName?: string, lastName?: string): Promise<void> {
    const patch: Record<string, string> = {};
    if (firstName?.trim()) patch.firstName = firstName.trim();
    if (lastName?.trim()) patch.lastName = lastName.trim();
    if (!Object.keys(patch).length) return;
    await this.users.updateOne({ _id: id }, { $set: patch });
  }

  /** The shape safe to return to a client — never includes the password hash. */
  toProfile(user: UserDocument) {
    return {
      id: user._id.toString(),
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      avatarUrl: user.avatarUrl,
      status: user.status,
      lastLoginAt: user.lastLoginAt,
    };
  }
}
