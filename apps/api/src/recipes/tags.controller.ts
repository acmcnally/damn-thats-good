import type { TagSummary } from '@dtg/shared';
import { Controller, Get, UseGuards } from '@nestjs/common';

import { type Book, BookContextGuard } from './book-context.guard';
import { CurrentBook } from './current-book.decorator';
import { TagsService } from './tags.service';

/** Book-scoped tag list, for the entry form's `+` add-tag control's search-or-create. */
@Controller('tags')
@UseGuards(BookContextGuard)
export class TagsController {
  constructor(private readonly tags: TagsService) {}

  @Get()
  list(@CurrentBook() book: Book): Promise<TagSummary[]> {
    return this.tags.findAllForBook(book.id);
  }
}
