import { Inject, Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Request } from 'express';
import { ExtractJwt, Strategy } from 'passport-jwt';

import { ACCESS_COOKIE } from 'src/common/auth/cookies';
import { APP_CONFIG } from 'src/common/config/config.module';
import { AppConfig } from 'src/common/config/configuration';
import { AuthenticatedUser } from 'src/common/context/request-context';
import { DomainException } from 'src/common/errors/domain.exception';
import { UsersService } from 'src/users/users.service';
import { AccessTokenPayload } from './token.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    @Inject(APP_CONFIG) config: AppConfig,
    private readonly users: UsersService,
  ) {
    super({
      // Cookie first (browsers), bearer second (server-to-server and tests).
      jwtFromRequest: ExtractJwt.fromExtractors([
        (request: Request) => (request.cookies?.[ACCESS_COOKIE] as string | undefined) ?? null,
        ExtractJwt.fromAuthHeaderAsBearerToken(),
      ]),
      ignoreExpiration: false,
      secretOrKey: config.JWT_ACCESS_SECRET,
    });
  }

  /**
   * Re-reads the user on every request so a suspended account loses access
   * immediately rather than when its access token happens to expire.
   */
  async validate(payload: AccessTokenPayload): Promise<AuthenticatedUser> {
    const user = await this.users.findById(payload.sub);
    if (!user || user.status !== 'ACTIVE') {
      throw DomainException.unauthorized('Sign in to continue.');
    }
    return { userId: user._id.toString(), email: user.email };
  }
}
