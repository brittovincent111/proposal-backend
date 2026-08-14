import { Controller, Get, Param } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { Public, SkipTenant } from 'src/common/decorators';
import { BlogService } from './blog.service';

@ApiTags('blog')
@Controller('blog/posts')
@Public()
@SkipTenant()
export class BlogController {
  constructor(private readonly blog: BlogService) {}

  @Get()
  @ApiOperation({ summary: 'Public blog listing.' })
  async list() {
    return { posts: await this.blog.listPublic() };
  }

  @Get(':slug')
  @ApiOperation({ summary: 'One public blog post by slug.' })
  async bySlug(@Param('slug') slug: string) {
    return this.blog.getPublicBySlug(slug);
  }
}
