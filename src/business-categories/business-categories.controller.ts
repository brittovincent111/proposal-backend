import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { Public } from 'src/common/decorators';
import { BusinessCategoriesService } from './business-categories.service';

@ApiTags('public')
@Controller('public/business-categories')
@Public()
export class BusinessCategoriesController {
  constructor(private readonly categories: BusinessCategoriesService) {}

  @Get()
  @ApiOperation({ summary: 'Business categories shown during workspace signup and template setup.' })
  list() {
    return this.categories.list();
  }
}
