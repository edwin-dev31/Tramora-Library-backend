import {
  BadGatewayException,
  GatewayTimeoutException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { setTimeout as delay } from 'node:timers/promises';
import type { z } from 'zod';
import type { Book } from '../../books/models/book.model.js';
import type {
  BooksProvider,
  BookSearch,
} from '../../books/providers/books.provider.js';
import { parseBookProviderId } from '../../books/providers/book-provider-id.js';
import { OpenLibraryMapper } from './open-library.mapper.js';
import {
  openLibrarySearchSchema,
  openLibraryWorkSchema,
} from './open-library.types.js';

const TIMEOUT_MS = 10_000;
const CACHE_TTL_MS = 5 * 60_000;
const CACHE_MAX_ENTRIES = 200;

@Injectable()
export class OpenLibraryService implements BooksProvider {
  private readonly logger = new Logger(OpenLibraryService.name);

  private unavailableUntil = 0;
  private nextRequestAt = 0;
  private requestSlot: Promise<void> = Promise.resolve();
  private sessionCookie: string | null = null;
  private sessionPromise: Promise<string | null> | null = null;
  private readonly pending = new Map<string, Promise<unknown>>();
  private readonly cache = new Map<
    string,
    { expiresAt: number; value: unknown }
  >();

  constructor(@Inject(ConfigService) private readonly config: ConfigService) {}

  async search(search: BookSearch) {
    this.logger.log(
      `Using Open Library for book search (field=${search.field}, limit=${search.limit}, offset=${search.offset}).`,
    );
    const payload = await this.request(
      'search.json',
      OpenLibraryMapper.toSearchParams(search),
      openLibrarySearchSchema,
    );
    return OpenLibraryMapper.toPage(payload, search);
  }

  async findById(id: string): Promise<Book> {
    this.logger.log(`Using Open Library for book detail (${id}).`);
    const { provider, remoteId } = parseBookProviderId(id);
    if (provider !== 'open_library' || !/^OL\d+W$/.test(remoteId)) {
      throw new NotFoundException('Book not found.');
    }
    const work = await this.request(
      `works/${remoteId}.json`,
      new URLSearchParams(),
      openLibraryWorkSchema,
    );
    if (work.key !== `/works/${remoteId}`) throw this.unavailable();

    // Search provides all author names in one request, avoiding an author request per name.
    try {
      const result = await this.request(
        'search.json',
        new URLSearchParams({
          q: `key:/works/${remoteId}`,
          fields: OpenLibraryMapper.fields,
          limit: '1',
        }),
        openLibrarySearchSchema,
      );
      const summary = result.docs.find(
        (doc) => OpenLibraryMapper.toBook(doc).id === id,
      );
      return OpenLibraryMapper.toDetail(work, summary);
    } catch (error) {
      // The work itself is authoritative; optional search metadata may be unavailable.
      if (
        error instanceof BadGatewayException ||
        error instanceof GatewayTimeoutException ||
        error instanceof NotFoundException
      ) {
        return OpenLibraryMapper.toDetail(work);
      }
      throw error;
    }
  }

  private request<T>(
    path: string,
    params: URLSearchParams,
    schema: z.ZodType<T>,
  ): Promise<T> {
    const base =
      this.config.get<string>('OPEN_LIBRARY_API_URL') ||
      'https://openlibrary.org';
    const url = new URL(`${base.replace(/\/$/, '')}/${path}`);
    url.search = params.toString();
    const key = url.toString();
    const cached = this.cache.get(key);
    if (cached && cached.expiresAt > Date.now())
      return Promise.resolve(cached.value as T);
    this.cache.delete(key);
    if (Date.now() < this.unavailableUntil)
      return Promise.reject(this.unavailable());
    const existing = this.pending.get(key);
    if (existing) return existing as Promise<T>;

    const request = this.performRequest(url, schema)
      .then((value) => {
        if (this.cache.size >= CACHE_MAX_ENTRIES) {
          this.cache.delete(this.cache.keys().next().value!);
        }
        this.cache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
        return value;
      })
      .finally(() => this.pending.delete(key));
    this.pending.set(key, request);
    return request;
  }

  private async performRequest<T>(url: URL, schema: z.ZodType<T>): Promise<T> {
    const cookie = await this.getSessionCookie();
    await this.waitForRequestSlot();
    if (Date.now() < this.unavailableUntil) throw this.unavailable();
    try {
      const response = await fetch(url, {
        headers: {
          Accept: 'application/json',
          'User-Agent':
            this.config.get<string>('OPEN_LIBRARY_USER_AGENT') ||
            'CapstoneLibrary/1.0',
          ...(cookie ? { Cookie: cookie } : {}),
        },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (response.status === 404)
        throw new NotFoundException('Book not found.');
      if (!response.ok) {
        this.unavailableUntil =
          Date.now() + (response.status === 429 ? 60_000 : 10_000);
        throw this.unavailable();
      }
      return schema.parse(await response.json());
    } catch (error) {
      if (
        error instanceof BadGatewayException ||
        error instanceof NotFoundException
      )
        throw error;
      this.unavailableUntil = Date.now() + 10_000;
      if (
        error instanceof Error &&
        ['TimeoutError', 'AbortError'].includes(error.name)
      ) {
        throw this.timeout();
      }
      throw this.unavailable();
    }
  }

  private waitForRequestSlot(): Promise<void> {
    const deadline = Date.now() + TIMEOUT_MS;
    // Serialize request starts so delayed timers cannot release a burst of calls.
    const slot = this.requestSlot.then(async () => {
      if (Date.now() < this.unavailableUntil) throw this.unavailable();
      const wait = Math.max(0, this.nextRequestAt - Date.now());
      if (Date.now() + wait >= deadline) throw this.timeout();
      if (wait) await delay(wait);
      if (Date.now() >= deadline) throw this.timeout();
      this.nextRequestAt = Date.now() + 1_000;
    });
    this.requestSlot = slot.catch(() => {});
    return slot;
  }

  private getSessionCookie(): Promise<string | null> {
    const access =
      this.config.get<string>('OPEN_LIBRARY_ACCESS_KEY')?.trim() ||
      this.config.get<string>('OPEN_LIBRARY_ACCESS')?.trim();
    const secret =
      this.config.get<string>('OPEN_LIBRARY_SECRET_KEY')?.trim() ||
      this.config.get<string>('OPEN_LIBRARY_SECRET')?.trim();
    if (!access && !secret) return Promise.resolve(null);
    if (!access || !secret) {
      return Promise.reject(
        new BadGatewayException({
          code: 'BOOK_PROVIDER_CONFIG_INVALID',
          message:
            'Open Library access and secret keys must be configured together.',
        }),
      );
    }
    if (this.sessionCookie) return Promise.resolve(this.sessionCookie);
    if (!this.sessionPromise) {
      this.sessionPromise = this.login(access, secret).finally(() => {
        this.sessionPromise = null;
      });
    }
    return this.sessionPromise;
  }

  private async login(access: string, secret: string): Promise<string> {
    await this.waitForRequestSlot();
    const base =
      this.config.get<string>('OPEN_LIBRARY_API_URL') ||
      'https://openlibrary.org';
    const loginUrl =
      this.config.get<string>('OPEN_LIBRARY_LOGIN_URL') ||
      `${base.replace(/\/$/, '')}/account/login.json`;
    try {
      const response = await fetch(loginUrl, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'User-Agent':
            this.config.get<string>('OPEN_LIBRARY_USER_AGENT') ||
            'CapstoneLibrary/1.0',
        },
        body: JSON.stringify({ access, secret }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!response.ok) {
        this.unavailableUntil = Date.now() + 10_000;
        throw this.unavailable();
      }
      const cookies =
        typeof response.headers.getSetCookie === 'function'
          ? response.headers.getSetCookie()
          : [response.headers.get('set-cookie') ?? ''];
      const cookie = cookies
        .map((value) => value.split(';', 1)[0].trim())
        .find((value) => value.length > 0);
      if (!cookie) {
        this.unavailableUntil = Date.now() + 10_000;
        throw this.unavailable();
      }
      this.sessionCookie = cookie;
      this.logger.log('Open Library authenticated session established.');
      return cookie;
    } catch (error) {
      if (error instanceof BadGatewayException) throw error;
      this.unavailableUntil = Date.now() + 10_000;
      if (
        error instanceof Error &&
        ['TimeoutError', 'AbortError'].includes(error.name)
      ) {
        throw this.timeout();
      }
      throw this.unavailable();
    }
  }

  private unavailable() {
    return new BadGatewayException({
      code: 'BOOK_PROVIDER_UNAVAILABLE',
      message: 'The book provider is unavailable. Please try again later.',
    });
  }

  private timeout() {
    return new GatewayTimeoutException({
      code: 'BOOK_PROVIDER_TIMEOUT',
      message: 'The book provider took too long to respond.',
    });
  }
}
