import { Inject, Injectable } from '@nestjs/common';
import type { PoolClient } from 'pg';
import { BaseRepository } from '../common/database/base.repository.js';
import type { RepositoryExecutor } from '../common/database/base.repository.js';
import { DatabaseService } from '../database/database.service.js';
import type { Book } from './models/book.model.js';

export interface BookRecord {
  id: string;
  provider: 'google_books';
  provider_id: string;
  title: string;
  author: string;
  description: string | null;
  genre: string | null;
  cover_url: string | null;
  available: boolean;
}

@Injectable()
export class BooksRepository extends BaseRepository<BookRecord> {
  constructor(@Inject(DatabaseService) database: DatabaseService) {
    super(database, 'books', [
      'id',
      'provider',
      'provider_id',
      'title',
      'author',
      'description',
      'genre',
      'cover_url',
      'available',
    ]);
  }

  async findByProviderId(providerId: string, executor?: RepositoryExecutor) {
    const result = await this.executor(executor).query<BookRecord>(
      `SELECT ${this.selectColumns()} FROM "books" WHERE provider = 'google_books' AND provider_id = $1`,
      [providerId],
    );
    return result.rows[0] ?? null;
  }

  async createReference(
    providerId: string,
    book: Book,
    executor: RepositoryExecutor,
  ): Promise<string> {
    await this.executor(executor).query(
      `INSERT INTO "books" (provider, provider_id, title, author, description, cover_url)
       VALUES ('google_books', $1, $2, $3, $4, $5)
       ON CONFLICT (provider, provider_id) DO NOTHING`,
      [
        providerId,
        book.title.slice(0, 500),
        book.authors.join(', ').slice(0, 500),
        book.description,
        book.coverUrl,
      ],
    );
    const result = await this.executor(executor).query<{ id: string }>(
      `SELECT id FROM "books" WHERE provider = 'google_books' AND provider_id = $1 FOR UPDATE`,
      [providerId],
    );
    return result.rows[0].id;
  }

  lockById(id: string, executor: PoolClient) {
    return this.executor(executor).query<BookRecord>(
      `SELECT ${this.selectColumns()} FROM "books" WHERE id = $1 FOR UPDATE`,
      [id],
    );
  }

  async setAvailability(
    id: string,
    available: boolean,
    executor: RepositoryExecutor,
  ) {
    return this.updateById(id, { available }, executor);
  }
}
