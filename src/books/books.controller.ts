import {
  Controller,
  Get,
  Inject,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { AuthUser } from '../auth/auth.schemas.js';
import { providerIdSchema } from './dto/book-reference.dto.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { BooksService } from './books.service.js';
import { searchBooksSchema } from './dto/search-books.dto.js';
import type { SearchBooksDto } from './dto/search-books.dto.js';

@Controller('books')
export class BooksController {
  constructor(@Inject(BooksService) private readonly books: BooksService) {}

  @Get()
  search(@Query({ schema: searchBooksSchema }) query: SearchBooksDto) {
    return this.books.search(query);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  detail(
    @Param({ schema: z.strictObject({ id: providerIdSchema }) })
    params: { id: string },
    @CurrentUser() user: AuthUser,
  ) {
    return this.books.detail(params.id, user.id);
  }
}