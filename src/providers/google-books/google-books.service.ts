import {
  BadGatewayException,
  GatewayTimeoutException,
  Inject,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BooksProvider } from '../../books/providers/books.provider.js';
import type { BookSearch } from '../../books/providers/books.provider.js';
import type { Book } from '../../books/models/book.model.js';
import type { Page } from '../../common/pagination/page.js';
import { GoogleBooksMapper } from './google-books.mapper.js';
import type { GoogleBooksResponse } from './google-books.types.js';

@Injectable()
export class GoogleBooksService implements BooksProvider {
  constructor(@Inject(ConfigService) private readonly config: ConfigService) {}

  async search(search: BookSearch): Promise<Page<Book>> {
    const url = new URL(this.config.getOrThrow<string>('GOOGLE_BOOKS_API_URL'));
    const apiKey = this.config.get<string>('GOOGLE_BOOKS_KEY');
    
    const params = GoogleBooksMapper.toSearchParams(search);
    params.forEach((value, key) => url.searchParams.set(key, value));
    
    if (apiKey) url.searchParams.set('key', apiKey);

    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) {
        throw new BadGatewayException({
          code: 'BOOK_PROVIDER_UNAVAILABLE',
          message: 'The book provider is unavailable. Please try again later.',
        });
      }
      const payload: GoogleBooksResponse = await response.json();
      return GoogleBooksMapper.toPage(payload, search);
    } catch (error) {
      if (error instanceof BadGatewayException) throw error;
      if (
        error instanceof Error &&
        ['TimeoutError', 'AbortError'].includes(error.name)
      ) {
        throw new GatewayTimeoutException({
          code: 'BOOK_PROVIDER_TIMEOUT',
          message: 'The book provider took too long to respond.',
        });
      }
      throw new BadGatewayException({
        code: 'BOOK_PROVIDER_UNAVAILABLE',
        message: 'The book provider is unavailable. Please try again later.',
      });
    }
  }
}
