import { Module } from '@nestjs/common';
import { BooksController } from './books.controller.js';
import { BooksService } from './books.service.js';
import { BooksProvider } from './providers/books.provider.js';
import { GoogleBooksModule } from '../providers/google-books/google-books.module.js';
import { GoogleBooksService } from '../providers/google-books/google-books.service.js';
import { AuthModule } from '../auth/auth.module.js';
import { BookReferencesService } from './book-references.service.js';
import { BooksRepository } from './books.repository.js';

@Module({
  imports: [AuthModule, GoogleBooksModule],
  controllers: [BooksController],
  providers: [
    BooksService,
    BookReferencesService,
    BooksRepository,
    { provide: BooksProvider, useExisting: GoogleBooksService },
  ],
  exports: [BookReferencesService, BooksRepository],
})
export class BooksModule {}
