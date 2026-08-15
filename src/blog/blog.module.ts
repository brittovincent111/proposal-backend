import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { PlatformAdminModule } from 'src/platform-admin/platform-admin.module';
import { User, UserSchema } from 'src/users/user.schema';
import { AdminBlogController } from './admin-blog.controller';
import { BlogController } from './blog.controller';
import { BlogPost, BlogPostSchema } from './blog-post.schema';
import { BlogService } from './blog.service';

@Module({
  imports: [
    PlatformAdminModule,
    MongooseModule.forFeature([
      { name: BlogPost.name, schema: BlogPostSchema },
      // AdminBlogController applies PlatformAdminGuard, and Nest builds an
      // enhancer in the module that uses it — so the guard's UserModel has to
      // be resolvable here, not only where the guard is declared.
      { name: User.name, schema: UserSchema },
    ]),
  ],
  controllers: [BlogController, AdminBlogController],
  providers: [BlogService],
  exports: [BlogService],
})
export class BlogModule {}
