import {
  BadGatewayException,
  GatewayTimeoutException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { z } from 'zod';
import { BooksProvider } from '../../books/providers/books.provider.js';
import type { BookSearch } from '../../books/providers/books.provider.js';
import type { Book } from '../../books/models/book.model.js';
import type { Page } from '../../common/pagination/page.js';
import { GoogleBooksMapper } from './google-books.mapper.js';
import {
  googleBookSchema,
  googleBooksResponseSchema,
} from './google-books.types.js';

@Injectable()
export class GoogleBooksService implements BooksProvider {
  private unavailableUntil = 0;
  private readonly pending = new Map<string, Promise<unknown>>();

  constructor(@Inject(ConfigService) private readonly config: ConfigService) {}

  async search(search: BookSearch): Promise<Page<Book>> {
    const url = new URL(this.config.getOrThrow<string>('GOOGLE_BOOKS_API_URL'));

    const params = GoogleBooksMapper.toSearchParams(search);
    params.forEach((value, key) => url.searchParams.set(key, value));

    const payload = await this.request(url, googleBooksResponseSchema);
    return GoogleBooksMapper.toPage(payload, search);
  }

  async findById(id: string): Promise<Book> {
    const url = new URL(this.config.getOrThrow<string>('GOOGLE_BOOKS_API_URL'));
    url.pathname = `${url.pathname.replace(/\/$/, '')}/${encodeURIComponent(id)}`;
    const volume = await this.request(url, googleBookSchema);
    if (volume.id !== id)
      throw new BadGatewayException('Invalid book provider response.');
    return GoogleBooksMapper.toBook(volume);
  }

  private request<T>(url: URL, schema: z.ZodType<T>): Promise<T> {
    if (Date.now() < this.unavailableUntil) {
      return Promise.reject(
        new BadGatewayException({
          code: 'BOOK_PROVIDER_UNAVAILABLE',
          message:
            'Book searches are temporarily paused because the provider is unavailable. Please try again later.',
        }),
      );
    }
    const key = url.toString();
    const existing = this.pending.get(key);
    if (existing) return existing as Promise<T>;
    const request = this.performRequest(url, schema).finally(() =>
      this.pending.delete(key),
    );
    this.pending.set(key, request);
    return request;
  }

  private async performRequest<T>(url: URL, schema: z.ZodType<T>): Promise<T> {
    const apiKey = this.config.get<string>('GOOGLE_BOOKS_KEY');
    if (apiKey) url.searchParams.set('key', apiKey);

    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(10000),
      });
      if (response.status === 404)
        throw new NotFoundException('Book not found.');
      if (!response.ok) {
        // Stop repeated quota failures. Successful results are not cached here.
        this.unavailableUntil =
          Date.now() + (response.status === 429 ? 15 * 60_000 : 60_000);
        throw new BadGatewayException({
          code: 'BOOK_PROVIDER_UNAVAILABLE',
          message: 'The book provider is unavailable. Please try again later.',
        });
      }
      return schema.parse(await response.json());
    } catch (error) {
      if (
        error instanceof BadGatewayException ||
        error instanceof NotFoundException
      )
        throw error;
      if (
        error instanceof Error &&
        ['TimeoutError', 'AbortError'].includes(error.name)
      ) {
        this.unavailableUntil = Date.now() + 60_000;
        throw new GatewayTimeoutException({
          code: 'BOOK_PROVIDER_TIMEOUT',
          message: 'The book provider took too long to respond.',
        });
      }
      this.unavailableUntil = Date.now() + 60_000;
      throw new BadGatewayException({
        code: 'BOOK_PROVIDER_UNAVAILABLE',
        message: 'The book provider is unavailable. Please try again later.',
      });
    }
  }
}
