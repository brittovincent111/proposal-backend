import { Body, Controller, Get, Header, Inject, Param, Post, Req } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';

import { APP_CONFIG } from 'src/common/config/config.module';
import { AppConfig } from 'src/common/config/configuration';
import { Public } from 'src/common/decorators';
import { hashIp } from 'src/common/utils/ids';
import { AcceptProposalDto, ChangeRequestDto } from './dto/public-proposal.dto';
import { PublicProposalsService, VisitorContext } from './public-proposals.service';

/**
 * The only unauthenticated surface in the API.
 *
 * Every route is rate limited (map.md §34) and the token is treated as the sole
 * credential — there is no id in any path, so a share link cannot be guessed by
 * walking sequential identifiers.
 */
@ApiTags('public')
@Controller('public/proposals')
@Public()
@Throttle({ default: { limit: 30, ttl: 60_000 } })
export class PublicProposalsController {
  constructor(
    private readonly proposals: PublicProposalsService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  @Get(':token')
  @ApiOperation({ summary: 'The shared proposal, as the customer sees it.' })
  view(@Param('token') token: string, @Req() request: Request) {
    return this.proposals.view(token, this.visitorOf(request));
  }

  @Get(':token/html')
  @Header('Content-Type', 'text/html; charset=utf-8')
  html(@Param('token') token: string) {
    return this.proposals.html_(token);
  }

  @Post(':token/accept')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  accept(
    @Param('token') token: string,
    @Body() body: AcceptProposalDto,
    @Req() request: Request,
  ) {
    return this.proposals.accept(token, body, this.visitorOf(request));
  }

  @Post(':token/change-request')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  changeRequest(
    @Param('token') token: string,
    @Body() body: ChangeRequestDto,
    @Req() request: Request,
  ) {
    return this.proposals.requestChanges(token, body, this.visitorOf(request));
  }

  private visitorOf(request: Request): VisitorContext {
    return {
      // Hashed so the timeline can distinguish visitors without storing an IP.
      ipHash: hashIp(request.ip, this.config.JWT_ACCESS_SECRET),
      userAgent: (request.header('user-agent') ?? '').slice(0, 200),
    };
  }
}
