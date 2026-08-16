import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { PlatformAdminModule } from 'src/platform-admin/platform-admin.module';
import { User, UserSchema } from 'src/users/user.schema';
import { AiBlogTopicService } from './ai-blog-topic.service';
import { AdminBlogController } from './admin-blog.controller';
import { BlogController } from './blog.controller';
import { BlogPost, BlogPostSchema } from './blog-post.schema';
import {
  BlogTopicRecommendation,
  BlogTopicRecommendationSchema,
} from './blog-topic-recommendation.schema';
import { BlogService } from './blog.service';

@Module({
  imports: [
    PlatformAdminModule,
    MongooseModule.forFeature([
      { name: BlogPost.name, schema: BlogPostSchema },
      { name: BlogTopicRecommendation.name, schema: BlogTopicRecommendationSchema },
      // AdminBlogController applies PlatformAdminGuard, and Nest builds an
      // enhancer in the module that uses it — so the guard's UserModel has to
      // be resolvable here, not only where the guard is declared.
      { name: User.name, schema: UserSchema },
    ]),
  ],
  controllers: [BlogController, AdminBlogController],
  providers: [BlogService, AiBlogTopicService],
  exports: [BlogService, AiBlogTopicService],
})
export class BlogModule {}
