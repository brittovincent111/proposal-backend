import { Body, Controller, Get, HttpCode, Inject, Post, Req, Res } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request, Response } from 'express';

import { REFRESH_COOKIE, clearAuthCookies, setAuthCookies } from 'src/common/auth/cookies';
import { APP_CONFIG } from 'src/common/config/config.module';
import { AppConfig } from 'src/common/config/configuration';
import { AuthenticatedUser } from 'src/common/context/request-context';
import { CurrentUser, Public, SkipTenant } from 'src/common/decorators';
import { hashIp } from 'src/common/utils/ids';
import { AuthService, SessionContext } from './auth.service';
import {
  AcceptInviteDto,
  ForgotPasswordDto,
  GoogleRegisterDto,
  GoogleVerifyDto,
  LoginDto,
  RegisterDto,
  ResetPasswordDto,
} from './dto/auth.dto';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  @Post('register')
  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({ summary: 'Create an account and the organization it owns.' })
  async register(
    @Body() body: RegisterDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const { tokens, userId } = await this.auth.register(body, this.contextOf(request));
    setAuthCookies(response, this.config, tokens);
    return this.auth.profile(userId);
  }

  @Post('login')
  @Public()
  @HttpCode(200)
  // Credential-stuffing brake; the throttler keys on IP by default.
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async login(
    @Body() body: LoginDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const { tokens, userId } = await this.auth.login(body, this.contextOf(request));
    setAuthCookies(response, this.config, tokens);
    return this.auth.profile(userId);
  }

  @Post('forgot-password')
  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @HttpCode(202)
  @ApiOperation({
    summary: 'Send a password reset link.',
    description:
      'Always accepted, whether or not the address is registered. `delivered` is false when no mail transport is configured — the link is written to the server log instead.',
  })
  forgotPassword(@Body() body: ForgotPasswordDto) {
    return this.auth.forgotPassword(body.email);
  }

  @Post('reset-password')
  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(204)
  @ApiOperation({ summary: 'Set a new password from a reset link.' })
  async resetPassword(@Body() body: ResetPasswordDto) {
    await this.auth.resetPassword(body.token, body.password);
  }

  @Post('accept-invite')
  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'Set a first password from an invite link and sign in.' })
  async acceptInvite(
    @Body() body: AcceptInviteDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.auth.acceptInvite(body, this.contextOf(request));
    setAuthCookies(response, this.config, result.tokens);
    return this.auth.profile(result.userId);
  }

  @Post('refresh')
  @Public()
  @HttpCode(200)
  @ApiOperation({ summary: 'Rotates the refresh cookie and issues a new access token.' })
  async refresh(@Req() request: Request, @Res({ passthrough: true }) response: Response) {
    const presented = request.cookies?.[REFRESH_COOKIE] as string | undefined;
    const result = await this.auth.refresh(presented, this.contextOf(request));
    setAuthCookies(response, this.config, result.tokens);
    return this.auth.profile(result.userId.toString());
  }

  @Post('google/verify')
  @Public()
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'Verify Google ID token and check if user exists.' })
  async verifyGoogle(@Body() body: GoogleVerifyDto) {
    return this.auth.verifyGoogleToken(body.token);
  }

  @Post('google/register')
  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'Register new user or login existing user via Google OAuth.' })
  async registerGoogle(
    @Body() body: GoogleRegisterDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const { tokens, userId } = await this.auth.registerWithGoogle(body, this.contextOf(request));
    setAuthCookies(response, this.config, tokens);
    return this.auth.profile(userId);
  }

  @Post('logout')
  @Public()
  @HttpCode(204)
  async logout(@Req() request: Request, @Res({ passthrough: true }) response: Response) {
    await this.auth.logout(request.cookies?.[REFRESH_COOKIE] as string | undefined);
    clearAuthCookies(response, this.config);
  }

  @Get('me')
  @SkipTenant()
  @ApiOperation({ summary: 'Current user and the organizations they belong to.' })
  me(@CurrentUser() user: AuthenticatedUser) {
    return this.auth.profile(user.userId);
  }

  private contextOf(request: Request): SessionContext {
    return {
      userAgent: request.header('user-agent'),
      ipHash: hashIp(request.ip, this.config.JWT_ACCESS_SECRET),
    };
  }
}
