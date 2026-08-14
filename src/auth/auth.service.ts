import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';

import { BusinessCategoriesService } from 'src/business-categories/business-categories.service';
import { DomainException } from 'src/common/errors/domain.exception';
import { ErrorCodes } from 'src/common/errors/error-codes';
import {
  OrganizationMember,
  OrganizationMemberDocument,
} from 'src/members/organization-member.schema';
import { Organization, OrganizationDocument } from 'src/organizations/organization.schema';
import { OrganizationsService } from 'src/organizations/organizations.service';
import { permissionsForRole } from 'src/permissions/permissions';
import { MailerService } from 'src/notifications/mailer.service';
import { starterDraft, starterForCategory } from 'src/templates/starter-templates';
import { TemplatesService } from 'src/templates/templates.service';
import { UsersService } from 'src/users/users.service';
import { CredentialsService } from './credentials.service';
import { LoginDto, RegisterDto } from './dto/auth.dto';
import { IssuedTokens, TokenService } from './token.service';

export interface SessionContext {
  userAgent?: string;
  ipHash?: string;
}

export interface SignInResult {
  tokens: IssuedTokens;
  userId: string;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly users: UsersService,
    private readonly tokens: TokenService,
    private readonly organizations: OrganizationsService,
    private readonly businessCategories: BusinessCategoriesService,
    private readonly templates: TemplatesService,
    private readonly credentials: CredentialsService,
    private readonly mailer: MailerService,
    @InjectModel(OrganizationMember.name)
    private readonly members: Model<OrganizationMemberDocument>,
    @InjectModel(Organization.name)
    private readonly organizationModel: Model<OrganizationDocument>,
  ) {}

  /** Sign-up creates the user and the organization they own in one step. */
  async register(dto: RegisterDto, context: SessionContext): Promise<SignInResult> {
    const existing = await this.users.findByEmail(dto.email);
    if (existing) {
      throw DomainException.conflict(
        ErrorCodes.EMAIL_ALREADY_REGISTERED,
        'An account with this email already exists.',
      );
    }

    const user = await this.users.create({
      email: dto.email,
      password: dto.password,
      firstName: dto.firstName,
      lastName: dto.lastName,
    });

    const organization = await this.organizations.provision({
      name: dto.organizationName,
      ownerUserId: user._id,
      ownerEmail: user.email,
      primaryBusinessCategoryId: dto.primaryBusinessCategoryId,
    });

    await this.provisionStarterTemplate(organization, user._id);
    await this.users.touchLogin(user._id);
    return {
      tokens: await this.tokens.issue({ id: user._id, email: user.email }, context),
      userId: user._id.toString(),
    };
  }

  /**
   * Gives the new organization one published, question-free template and makes
   * it the default.
   *
   * Without this the first quotation has no template to compile against, which
   * produced a document with no line items. A failure here must never cost
   * somebody their sign-up, so it is logged and swallowed — the compiler's
   * fallback body covers the gap until the owner picks a template.
   */
  private async provisionStarterTemplate(
    organization: OrganizationDocument,
    ownerUserId: Types.ObjectId,
  ): Promise<void> {
    const organizationId = organization._id.toString();

    try {
      const category = organization.primaryBusinessCategoryId
        ? await this.businessCategories.require(organization.primaryBusinessCategoryId.toString())
        : null;
      const starter = starterForCategory(category?.slug);

      const { template } = await this.templates.create(organizationId, ownerUserId.toString(), {
        name: starter.name,
        description: starter.description,
        category: starter.category,
        draft: starterDraft(starter),
      });

      const templateId = template.id;
      await this.templates.publish(organizationId, templateId, {
        changeNote: 'Starter template',
      });
      await this.organizations.updateSettings(organizationId, {
        defaultTemplateId: new Types.ObjectId(templateId),
      });
    } catch (error) {
      this.logger.error(
        `Could not provision a starter template for organization ${organizationId}`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  /**
   * Verifies credentials.
   *
   * A missing account and a wrong password produce the same error, and the hash
   * comparison still runs for an unknown email so response timing does not
   * disclose which addresses are registered.
   */
  async login(dto: LoginDto, context: SessionContext): Promise<SignInResult> {
    const user = await this.users.findByEmail(dto.email);
    const valid = await this.users.verifyPassword(user?.passwordHash ?? null, dto.password);

    if (!user || !valid || user.status !== 'ACTIVE') {
      throw DomainException.unauthorized(
        'Incorrect email or password.',
        ErrorCodes.INVALID_CREDENTIALS,
      );
    }

    await this.users.touchLogin(user._id);
    return {
      tokens: await this.tokens.issue({ id: user._id, email: user.email }, context),
      userId: user._id.toString(),
    };
  }

  /**
   * Starts a password reset.
   *
   * Always reports the same thing, whether or not the address is registered —
   * this endpoint is unauthenticated, so telling the caller which emails exist
   * would make it an account-enumeration oracle.
   *
   * `delivered` reflects whether mail actually went out. With no transport
   * configured the link is written to the server log instead, and the UI says so
   * rather than claiming an email is on its way.
   */
  async forgotPassword(email: string): Promise<{ delivered: boolean }> {
    const user = await this.users.findByEmail(email);
    if (!user || user.status === 'SUSPENDED') return { delivered: false };

    const { token, expiresAt } = await this.credentials.issue({
      userId: user._id,
      purpose: 'PASSWORD_RESET',
    });
    const url = this.mailer.appUrl(`/reset-password?token=${encodeURIComponent(token)}`);

    const { delivered } = await this.mailer.send({
      to: user.email,
      subject: 'Reset your password',
      body: `Open this link to choose a new password. It expires ${expiresAt.toISOString()}.\n\n${url}\n\nIf you did not ask for this, ignore it — nothing has changed.`,
    });

    return { delivered };
  }

  /**
   * Finishes a reset and signs every other session out.
   *
   * Revoking the refresh-token family matters: a reset is often triggered
   * *because* somebody else may have the old password.
   */
  async resetPassword(token: string, password: string): Promise<void> {
    const claimed = await this.credentials.consume(token, 'PASSWORD_RESET');
    await this.users.setPassword(claimed.userId, password);
    await this.tokens.revokeAllForUser(claimed.userId);
  }

  /** Sets the first password for an invited member and signs them straight in. */
  async acceptInvite(
    input: { token: string; password: string; firstName?: string; lastName?: string },
    context: SessionContext,
  ): Promise<SignInResult> {
    const claimed = await this.credentials.consume(input.token, 'INVITE');

    const user = await this.users.findById(claimed.userId);
    if (!user) {
      throw DomainException.invalid(
        ErrorCodes.VALIDATION_FAILED,
        'This invite is no longer valid. Ask for a new one.',
      );
    }

    await this.users.setPassword(user._id, input.password);
    await this.users.updateName(user._id, input.firstName, input.lastName);

    // The membership was created as INVITED; joining is what activates it.
    await this.members.updateOne(
      { userId: user._id, status: 'INVITED' },
      { $set: { status: 'ACTIVE', joinedAt: new Date() } },
    );

    await this.users.touchLogin(user._id);
    return {
      tokens: await this.tokens.issue({ id: user._id, email: user.email }, context),
      userId: user._id.toString(),
    };
  }

  refresh(presented: string | undefined, context: SessionContext) {
    if (!presented) {
      throw DomainException.unauthorized(
        'Session expired. Sign in again.',
        ErrorCodes.REFRESH_TOKEN_INVALID,
      );
    }
    return this.tokens.rotate(presented, context);
  }

  logout(presented: string | undefined): Promise<void> {
    return this.tokens.revoke(presented);
  }

  /** /auth/me — the profile plus every organization this user can act in. */
  async profile(userId: string) {
    const user = await this.users.findById(userId);
    if (!user) throw DomainException.unauthorized('Sign in to continue.');

    const memberships = await this.members
      .find({ userId: new Types.ObjectId(userId), status: 'ACTIVE' })
      .sort({ createdAt: 1 })
      .lean();

    const organizations = await this.organizationModel
      .find({ _id: { $in: memberships.map((member) => member.organizationId) } })
      .lean();
    const categoryById = await this.businessCategories.mapByIds(
      organizations.map((organization) => organization.primaryBusinessCategoryId),
    );

    const byId = new Map(organizations.map((organization) => [organization._id.toString(), organization]));

    return {
      user: this.users.toProfile(user),
      organizations: memberships.flatMap((member) => {
        const organization = byId.get(member.organizationId.toString());
        if (!organization) return [];
        return [
          {
            id: organization._id.toString(),
            name: organization.name,
            slug: organization.slug,
            defaultCurrency: organization.defaultCurrency,
            locale: organization.locale,
            primaryBusinessCategory:
              categoryById.get(organization.primaryBusinessCategoryId?.toString() ?? '') ?? null,
            role: member.role,
            permissions: [...permissionsForRole(member.role)],
          },
        ];
      }),
    };
  }
}
