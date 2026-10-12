import {
  BadGatewayException,
  GatewayTimeoutException,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import { GoogleBooksService } from '../../providers/google-books/google-books.service.js';
import { OpenLibraryService } from '../../providers/open-library/open-library.service.js';
import { BooksProvider } from './books.provider.js';
import type { BookSearch } from './books.provider.js';
import { parseBookProviderId } from './book-provider-id.js';

@Injectable()
export class FallbackBooksProvider implements BooksProvider {
  private readonly logger = new Logger(FallbackBooksProvider.name);

  constructor(
    @Inject(GoogleBooksService) private readonly google: GoogleBooksService,
    @Inject(OpenLibraryService)
    private readonly openLibrary: OpenLibraryService,
  ) {}

  async search(search: BookSearch) {
    try {
      // An empty successful result is not a provider failure.
      return await this.google.search(search);
    } catch (error) {
      if (!this.isUnavailable(error)) throw error;
      this.logger.warn(
        `Google Books unavailable; switching to Open Library fallback (${this.errorCode(error)}).`,
      );
      try {
        return await this.openLibrary.search(search);
      } catch (fallbackError) {
        if (!this.isUnavailable(fallbackError)) throw fallbackError;
        this.logger.error(
          `Google Books and Open Library are unavailable (${this.errorCode(fallbackError)}).`,
        );
        throw new BadGatewayException({
          code: 'BOOK_PROVIDERS_UNAVAILABLE',
          message:
            'Book search is temporarily unavailable. Please try again later.',
        });
      }
    }
  }

  findById(id: string) {
    // Volume IDs and work IDs are unrelated. Never look up a Google ID in OL.
    return parseBookProviderId(id).provider === 'open_library'
      ? this.openLibrary.findById(id)
      : this.google.findById(id);
  }

  private isUnavailable(error: unknown): boolean {
    return (
      error instanceof BadGatewayException ||
      error instanceof GatewayTimeoutException
    );
  }

  private errorCode(error: unknown): string {
    if (
      error instanceof BadGatewayException ||
      error instanceof GatewayTimeoutException
    ) {
      const response = error.getResponse();
      if (
        typeof response === 'object' &&
        response !== null &&
        'code' in response
      ) {
        return String(response.code);
      }
      return error.constructor.name;
    }
    return error instanceof Error ? error.name : 'UNKNOWN_ERROR';
  }
}
