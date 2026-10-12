import { Module } from '@nestjs/common';
import { BooksController } from './books.controller.js';
import { BooksService } from './books.service.js';
import { BooksProvider } from './providers/books.provider.js';
import { GoogleBooksModule } from '../providers/google-books/google-books.module.js';
import { OpenLibraryModule } from '../providers/open-library/open-library.module.js';
import { FallbackBooksProvider } from './providers/fallback-books.provider.js';
import { AuthModule } from '../auth/auth.module.js';
import { BookReferencesService } from './book-references.service.js';
import { BooksRepository } from './books.repository.js';

@Module({
  imports: [AuthModule, GoogleBooksModule, OpenLibraryModule],
  controllers: [BooksController],
  providers: [
    BooksService,
    BookReferencesService,
    BooksRepository,
    FallbackBooksProvider,
    { provide: BooksProvider, useExisting: FallbackBooksProvider },
  ],
  exports: [BookReferencesService, BooksRepository],
})
export class BooksModule {}
