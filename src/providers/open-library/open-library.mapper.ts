import type { Book } from '../../books/models/book.model.js';
import { BookSearchField } from '../../books/dto/book-search-field.enum.js';
import type { BookSearch } from '../../books/providers/books.provider.js';
import { OPEN_LIBRARY_PREFIX } from '../../books/providers/book-provider-id.js';
import type { Page } from '../../common/pagination/page.js';
import type {
  OpenLibrarySearchBook,
  OpenLibrarySearchResponse,
  OpenLibraryWork,
} from './open-library.types.js';

export class OpenLibraryMapper {
  static readonly fields = 'key,title,author_name,first_publish_year,cover_i';

  static toSearchParams(search: BookSearch): URLSearchParams {
    return new URLSearchParams({
      [search.field === BookSearchField.ALL ? 'q' : search.field]: search.query,
      fields: this.fields,
      limit: String(search.limit),
      offset: String(search.offset),
    });
  }

  static toBook(doc: OpenLibrarySearchBook): Book {
    return {
      id: `${OPEN_LIBRARY_PREFIX}${doc.key.replace(/^\/works\//, '')}`,
      title: doc.title ?? 'Untitled',
      authors: doc.author_name ?? [],
      publishedDate: doc.first_publish_year?.toString() ?? null,
      description: null,
      coverUrl: this.coverUrl(doc.cover_i),
    };
  }

  static toPage(
    response: OpenLibrarySearchResponse,
    search: BookSearch,
  ): Page<Book> {
    return {
      items: response.docs.map((doc) => this.toBook(doc)),
      pagination: {
        total: response.numFound ?? response.num_found ?? 0,
        limit: search.limit,
        offset: search.offset,
      },
    };
  }

  static toDetail(
    work: OpenLibraryWork,
    summary?: OpenLibrarySearchBook,
  ): Book {
    const book = this.toBook(summary ?? { key: work.key });
    return {
      ...book,
      title: work.title,
      description:
        typeof work.description === 'string'
          ? work.description
          : (work.description?.value ?? null),
      publishedDate: work.first_publish_date ?? book.publishedDate,
      coverUrl:
        this.coverUrl(work.covers?.find((cover) => cover > 0)) ?? book.coverUrl,
    };
  }

  private static coverUrl(cover?: number): string | null {
    return cover && cover > 0
      ? `https://covers.openlibrary.org/b/id/${cover}-M.jpg`
      : null;
  }
}
