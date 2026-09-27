import { Inject, Injectable } from '@nestjs/common';
import { BookSearch, BooksProvider } from './providers/books.provider.js';
import { Page } from '../common/pagination/page.js';
import { Book } from './models/book.model.js';


@Injectable()
export class BooksService {
  constructor(
    @Inject(BooksProvider) private readonly provider: BooksProvider,
  ) {}

  search(search: BookSearch): Promise<Page<Book>> {
    return this.provider.search(search);
  }
}
