import { Controller, Get, Inject, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { BooksService } from './books.service.js';
import { searchBooksSchema } from './dto/search-books.dto.js';
import type { SearchBooksDto } from './dto/search-books.dto.js';

@Controller('books')
@UseGuards(JwtAuthGuard)
export class BooksController {
  constructor(@Inject(BooksService) private readonly books: BooksService) {}

  @Get()
  search(@Query({ schema: searchBooksSchema }) query: SearchBooksDto) {
    return this.books.search(query);
  }
}
