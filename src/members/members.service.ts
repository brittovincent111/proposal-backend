import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';

import { DomainException } from 'src/common/errors/domain.exception';
import { ErrorCodes } from 'src/common/errors/error-codes';
import { toObjectId } from 'src/common/utils/ids';
import { Role } from 'src/permissions/permissions';
import { CredentialsService } from 'src/auth/credentials.service';
import { MailerService } from 'src/notifications/mailer.service';
import { UsersService } from 'src/users/users.service';
import { User, UserDocument } from 'src/users/user.schema';
import { MemberStatus, OrganizationMember, OrganizationMemberDocument } from './organization-member.schema';

@Injectable()
export class MembersService {
  constructor(
    @InjectModel(OrganizationMember.name)
    private readonly members: Model<OrganizationMemberDocument>,
    @InjectModel(User.name) private readonly users: Model<UserDocument>,
    private readonly usersService: UsersService,
    private readonly credentials: CredentialsService,
    private readonly mailer: MailerService,
  ) {}

  async list(organizationId: string) {
    const members = await this.members
      .find({ organizationId: new Types.ObjectId(organizationId) })
      .sort({ createdAt: 1 })
      .lean();

    const users = await this.users
      .find({ _id: { $in: members.map((member) => member.userId) } })
      .lean();
    const byId = new Map(users.map((user) => [user._id.toString(), user]));

    return members.map((member) => {
      const user = byId.get(member.userId.toString());
      return {
        id: member._id.toString(),
        role: member.role,
        status: member.status,
        joinedAt: member.joinedAt,
        user: user
          ? {
              id: user._id.toString(),
              email: user.email,
              firstName: user.firstName,
              lastName: user.lastName,
              avatarUrl: user.avatarUrl,
            }
          : null,
      };
    });
  }

  /**
   * Invites someone by email, creating a placeholder user if they have never
   * signed up. The invite carries no secret yet — activation happens when the
   * invited address registers, which is why the user row is INVITED and has no
   * password hash.
   */
  async invite(
    organizationId: string,
    input: { email: string; role: Role },
    invitedById: string,
  ) {
    const organization = new Types.ObjectId(organizationId);
    const user =
      (await this.usersService.findByEmail(input.email)) ??
      (await this.usersService.create({ email: input.email, status: 'INVITED' }));

    const existing = await this.members.findOne({ organizationId: organization, userId: user._id });
    if (existing) {
      throw DomainException.conflict(
        ErrorCodes.CONCURRENT_EDIT_CONFLICT,
        'This person is already a member of the organization.',
      );
    }

    const member = await this.members.create({
      organizationId: organization,
      userId: user._id,
      role: input.role,
      status: user.status === 'ACTIVE' ? 'ACTIVE' : 'INVITED',
      joinedAt: user.status === 'ACTIVE' ? new Date() : null,
      invitedById: new Types.ObjectId(invitedById),
    });

    // An existing account joins immediately with the password it already has.
    // A new one needs a way in: mint a single-use link and hand it back to the
    // admin, who is authorised to manage this team, so it can be delivered even
    // where no mail transport is configured. Previously an invited user had no
    // credential and no token, and could never sign in at all.
    let inviteUrl: string | null = null;
    let delivered = false;

    if (member.status === 'INVITED') {
      const { token, expiresAt } = await this.credentials.issue({
        userId: user._id,
        purpose: 'INVITE',
        organizationId: organization,
        createdById: new Types.ObjectId(invitedById),
      });
      inviteUrl = this.mailer.appUrl(`/accept-invite?token=${encodeURIComponent(token)}`);

      ({ delivered } = await this.mailer.send({
        to: user.email,
        subject: 'You have been added to a workspace',
        body: `Open this link to set your password and join. It expires ${expiresAt.toISOString()}.\n\n${inviteUrl}`,
      }));
    }

    return {
      id: member._id.toString(),
      role: member.role,
      status: member.status,
      email: user.email,
      inviteUrl,
      delivered,
    };
  }

  async updateRole(organizationId: string, memberId: string, role: Role) {
    const member = await this.requireMember(organizationId, memberId);

    // Demoting the last OWNER would leave the organization unadministrable.
    if (member.role === 'OWNER' && role !== 'OWNER') {
      await this.assertNotLastOwner(organizationId, member._id);
    }

    member.role = role;
    await member.save();
    return { id: member._id.toString(), role: member.role, status: member.status };
  }

  async updateStatus(organizationId: string, memberId: string, status: MemberStatus) {
    const member = await this.requireMember(organizationId, memberId);
    if (member.role === 'OWNER' && status !== 'ACTIVE') {
      await this.assertNotLastOwner(organizationId, member._id);
    }

    member.status = status;
    if (status === 'ACTIVE' && !member.joinedAt) member.joinedAt = new Date();
    await member.save();
    return { id: member._id.toString(), role: member.role, status: member.status };
  }

  private async requireMember(
    organizationId: string,
    memberId: string,
  ): Promise<OrganizationMemberDocument> {
    const member = await this.members.findOne({
      _id: toObjectId(memberId, ErrorCodes.MEMBER_NOT_FOUND, 'Member'),
      organizationId: new Types.ObjectId(organizationId),
    });
    if (!member) throw DomainException.notFound(ErrorCodes.MEMBER_NOT_FOUND, 'Member not found.');
    return member;
  }

  private async assertNotLastOwner(organizationId: string, excluding: Types.ObjectId) {
    const owners = await this.members.countDocuments({
      organizationId: new Types.ObjectId(organizationId),
      role: 'OWNER',
      status: 'ACTIVE',
      _id: { $ne: excluding },
    });
    if (owners === 0) {
      throw DomainException.invalid(
        ErrorCodes.LAST_OWNER_PROTECTED,
        'An organization must keep at least one active owner.',
      );
    }
  }
}
