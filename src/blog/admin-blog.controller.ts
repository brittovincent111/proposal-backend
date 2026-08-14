import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { CurrentUser, SkipTenant } from 'src/common/decorators';
import type { AuthenticatedUser } from 'src/common/context/request-context';
import { PlatformAdminGuard } from 'src/platform-admin/platform-admin.guard';
import { BlogService } from './blog.service';
import { CreateBlogPostDto, UpdateBlogPostDto } from './dto/blog.dto';

@ApiTags('platform-admin-blog')
@Controller('admin/blog/posts')
@SkipTenant()
@UseGuards(PlatformAdminGuard)
export class AdminBlogController {
  constructor(private readonly blog: BlogService) {}

  @Get()
  @ApiOperation({ summary: 'All blog posts for the platform team.' })
  async list() {
    return { posts: await this.blog.listAdmin() };
  }

  @Get(':id')
  @ApiOperation({ summary: 'One blog post for editing.' })
  async byId(@Param('id') id: string) {
    return this.blog.getAdminById(id);
  }

  @Post()
  @ApiOperation({ summary: 'Creates a blog post.' })
  async create(@Body() body: CreateBlogPostDto, @CurrentUser() user: AuthenticatedUser) {
    return this.blog.create(body, user);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Updates a blog post.' })
  async update(
    @Param('id') id: string,
    @Body() body: UpdateBlogPostDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.blog.update(id, body, user);
  }
}
