import { Module } from '@nestjs/common';
import { BooksController } from './books.controller.js';
import { BooksService } from './books.service.js';
import { BooksProvider } from './providers/books.provider.js';
import { GoogleBooksModule } from '../providers/google-books/google-books.module.js';
import { GoogleBooksService } from '../providers/google-books/google-books.service.js';

@Module({
  imports: [GoogleBooksModule],
  controllers: [BooksController],
  providers: [
    BooksService,
    { provide: BooksProvider, useExisting: GoogleBooksService },
  ],
})
export class BooksModule {}
