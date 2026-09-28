import type { Book } from '../models/book.model.js';
import type { BookSearchField } from '../dto/book-search-field.enum.js';
import type { Page } from '../../common/pagination/page.js';

export interface BookSearch {
  query: string;
  field: BookSearchField;
  limit: number;
  offset: number;
}

export abstract class BooksProvider {
  abstract search(search: BookSearch): Promise<Page<Book>>;
  abstract findById(id: string): Promise<Book>;
}
