import { Inject, Injectable } from '@nestjs/common';
import { BookSearch, BooksProvider } from './providers/books.provider.js';
import { Page } from '../common/pagination/page.js';
import type { Book, BookDetail } from './models/book.model.js';
import { BooksRepository } from './books.repository.js';
import { bookAvailability } from './book-availability.js';

@Injectable()
export class BooksService {
  constructor(
    @Inject(BooksProvider) private readonly provider: BooksProvider,
    @Inject(BooksRepository) private readonly books: BooksRepository,
  ) {}

  search(search: BookSearch): Promise<Page<Book>> {
    return this.provider.search(search);
  }

  async detail(providerId: string, userId: string): Promise<BookDetail> {
    const saved = await this.books.findByProviderId(providerId);
    const [book, snapshot] = await Promise.all([
      saved ? Promise.resolve({
        id: providerId,
        title: saved.title,
        authors: saved.author ? [saved.author] : [],
        description: saved.description,
        coverUrl: saved.cover_url,
        publishedDate: null,
      }) : this.provider.findById(providerId),
      this.books.availability(providerId, userId),
    ]);
    return { ...book, availability: bookAvailability(snapshot, userId) };
  }
}
