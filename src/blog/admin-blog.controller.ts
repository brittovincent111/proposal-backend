import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { CurrentUser, SkipTenant } from 'src/common/decorators';
import type { AuthenticatedUser } from 'src/common/context/request-context';
import { PlatformAdminGuard } from 'src/platform-admin/platform-admin.guard';
import { AiBlogTopicService } from './ai-blog-topic.service';
import { BlogService } from './blog.service';
import {
  CreateBlogPostDto,
  FindNextBlogTopicDto,
  GenerateBlogDraftDto,
  UpdateBlogPostDto,
} from './dto/blog.dto';

@ApiTags('platform-admin-blog')
@Controller('admin/blog/posts')
@SkipTenant()
@UseGuards(PlatformAdminGuard)
export class AdminBlogController {
  constructor(
    private readonly blog: BlogService,
    private readonly topics: AiBlogTopicService,
  ) {}

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

  @Get('topic-recommendations')
  @ApiOperation({ summary: 'Past topic recommendations for the platform team.' })
  async topicRecommendations() {
    return { recommendations: await this.topics.listRecommendations() };
  }

  @Post()
  @ApiOperation({ summary: 'Creates a blog post.' })
  async create(@Body() body: CreateBlogPostDto, @CurrentUser() user: AuthenticatedUser) {
    return this.blog.create(body, user);
  }

  @Post('topic-recommendations/find-next')
  @ApiOperation({ summary: 'Researches and stores the next recommended blog topic.' })
  async findNextTopic(@Body() body: FindNextBlogTopicDto, @CurrentUser() user: AuthenticatedUser) {
    return this.topics.findNextTopic(body, user);
  }

  @Post('topic-recommendations/:id/approve')
  @ApiOperation({ summary: 'Approves a topic recommendation and turns it into a draft blog post.' })
  async approveTopic(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.topics.approveAndGenerate(id, user);
  }

  @Post('generate-draft')
  @ApiOperation({ summary: 'Generates and saves an AI blog draft for review.' })
  async generateDraft(@Body() body: GenerateBlogDraftDto, @CurrentUser() user: AuthenticatedUser) {
    return this.blog.generateDraft(body, user);
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
