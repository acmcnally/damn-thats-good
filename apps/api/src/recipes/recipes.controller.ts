import {
  createRecipeRequestSchema,
  type RecipeDetail,
  type RecipeSummary,
  saveContentRequestSchema,
  updateRecipeMetadataRequestSchema,
} from '@dtg/shared';
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';

import { CurrentUser } from '../auth/authenticated-user';
import { type Book, BookContextGuard } from './book-context.guard';
import { CurrentBook } from './current-book.decorator';
import { parseBody } from './parse-body';
import { RecipesService } from './recipes.service';

/** No route ever takes a `bookId` param — V1 has exactly one book per user,
 * so every handler resolves the caller's book via `BookContextGuard`. */
@Controller('recipes')
@UseGuards(BookContextGuard)
export class RecipesController {
  constructor(private readonly recipes: RecipesService) {}

  @Get()
  list(@CurrentBook() book: Book): Promise<RecipeSummary[]> {
    return this.recipes.findAllForBook(book.id);
  }

  @Get(':id')
  detail(@CurrentBook() book: Book, @Param('id') id: string): Promise<RecipeDetail> {
    return this.recipes.findOne(book.id, id);
  }

  @Post()
  @HttpCode(201)
  create(
    @CurrentUser() user: { id: string },
    @CurrentBook() book: Book,
    @Body() body: unknown,
  ): Promise<RecipeDetail> {
    const req = parseBody(createRecipeRequestSchema, body);
    return this.recipes.create(book.id, user.id, req);
  }

  @Patch(':id')
  updateMetadata(
    @CurrentBook() book: Book,
    @Param('id') id: string,
    @Body() body: unknown,
  ): Promise<RecipeDetail> {
    const req = parseBody(updateRecipeMetadataRequestSchema, body);
    return this.recipes.updateMetadata(book.id, id, req);
  }

  @Put(':id/content')
  saveContent(
    @CurrentUser() user: { id: string },
    @CurrentBook() book: Book,
    @Param('id') id: string,
    @Body() body: unknown,
  ): Promise<RecipeDetail> {
    const req = parseBody(saveContentRequestSchema, body);
    return this.recipes.saveContent(book.id, id, user.id, req);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@CurrentBook() book: Book, @Param('id') id: string): Promise<void> {
    return this.recipes.remove(book.id, id);
  }
}
