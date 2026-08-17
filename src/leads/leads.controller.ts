import { Body, Controller, Inject, Post, Req } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';

import { APP_CONFIG } from 'src/common/config/config.module';
import { AppConfig } from 'src/common/config/configuration';
import { Public } from 'src/common/decorators';
import { hashIp } from 'src/common/utils/ids';
import { CreateLeadDto } from './dto/lead.dto';
import { LeadsService } from './leads.service';

@ApiTags('leads')
@Controller('public/leads')
@Public()
export class LeadsController {
  constructor(
    private readonly leads: LeadsService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  @Post()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({ summary: 'Capture a marketing lead from the public website.' })
  create(@Body() body: CreateLeadDto, @Req() request: Request) {
    return this.leads.create(body, {
      ipHash: hashIp(request.ip, this.config.JWT_ACCESS_SECRET),
      userAgent: (request.header('user-agent') ?? '').slice(0, 200),
    });
  }
}
