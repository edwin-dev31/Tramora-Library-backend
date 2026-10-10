import type { Book } from '../../books/models/book.model.js';
import type { BookSearch } from '../../books/providers/books.provider.js';
import { BookSearchField } from '../../books/dto/book-search-field.enum.js';
import type { Page } from '../../common/pagination/page.js';
import type { GoogleBook, GoogleBooksResponse } from './google-books.types.js';

export class GoogleBooksMapper {
  static toSearchParams(search: BookSearch): URLSearchParams {
    const prefix = this.toGoogleField(search.field);

    return new URLSearchParams({
      q: prefix ? `${prefix}:${search.query}` : search.query,
      maxResults: String(search.limit),
      startIndex: String(search.offset),
    });
  }

  private static toGoogleField(field: BookSearchField): string {
    if (field === BookSearchField.ALL) return '';
    if (
      field === BookSearchField.TITLE ||
      field === BookSearchField.AUTHOR ||
      field === BookSearchField.PUBLISHER
    ) {
      return `in${field}`;
    }

    if (field === BookSearchField.SUBJECT) return '';
    return field;
  }

  static toBook(volume: GoogleBook): Book {
    const info = volume.volumeInfo;
    const cover =
      info?.imageLinks?.thumbnail ?? info?.imageLinks?.smallThumbnail;

    return {
      id: volume.id,
      title: info?.title ?? 'Untitled',
      authors: info?.authors ?? [],
      publishedDate: info?.publishedDate ?? null,
      description: info?.description ?? null,
      coverUrl: cover ? cover.replace(/^http:/, 'https:') : null,
    };
  }

  static toPage(response: GoogleBooksResponse, search: BookSearch): Page<Book> {
    return {
      items: (response.items ?? []).map((volume) => this.toBook(volume)),
      pagination: {
        total: response.totalItems,
        offset: search.offset,
        limit: search.limit,
      },
    };
  }
}
