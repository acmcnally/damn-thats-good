import { Module } from '@nestjs/common';

import { BooksModule } from '../books/books.module';
import { BookContextGuard } from './book-context.guard';
import { RecipesController } from './recipes.controller';
import { RecipesService } from './recipes.service';
import { TagsController } from './tags.controller';
import { TagsService } from './tags.service';

/** Owns `recipes`, `recipe_versions`, and `tags`/`recipe_tags` together (DAMN-2). */
@Module({
  imports: [BooksModule],
  controllers: [RecipesController, TagsController],
  providers: [RecipesService, TagsService, BookContextGuard],
})
export class RecipesModule {}
