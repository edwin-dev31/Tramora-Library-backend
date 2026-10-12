import { Inject, Injectable } from '@nestjs/common';
import type { PoolClient } from 'pg';
import { BaseRepository } from '../common/database/base.repository.js';
import type { RepositoryExecutor } from '../common/database/base.repository.js';
import { DatabaseService } from '../database/database.service.js';
import type { Book } from './models/book.model.js';
import { parseBookProviderId } from './providers/book-provider-id.js';
import type { BookProviderName } from './providers/book-provider-id.js';

export interface BookRecord {
  id: string;
  provider: BookProviderName;
  provider_id: string;
  title: string;
  author: string;
  description: string | null;
  genre: string | null;
  cover_url: string | null;
  available: boolean;
}

export interface AvailabilitySnapshot {
  borrower_id: string | null;
  reservation_user_id: string | null;
  has_reservation: boolean;
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
    const { provider, remoteId } = parseBookProviderId(providerId);
    const result = await this.executor(executor).query<BookRecord>(
      `SELECT ${this.selectColumns()} FROM "books" WHERE provider = $2 AND provider_id = $1`,
      [remoteId, provider],
    );
    return result.rows[0] ?? null;
  }

  async availability(providerId: string, userId: string) {
    const { provider, remoteId } = parseBookProviderId(providerId);
    // Ignore expired holds and inspect the next reader just as queue.sync does.
    // This read neither imports a book nor changes the reservation queue.
    const result = await this.database.query<AvailabilitySnapshot>(
      `SELECT loan.user_id AS borrower_id, next_reservation.user_id AS reservation_user_id,
        EXISTS (
          SELECT 1 FROM "reservations" own
          WHERE own.book_id = b.id AND own.user_id = $2
            AND (own.status = 'waiting' OR (own.status = 'ready' AND own.expires_at > now()))
        ) AS has_reservation
       FROM "books" b
       LEFT JOIN LATERAL (
         SELECT user_id FROM "loans" WHERE book_id = b.id AND status IN ('active', 'overdue') LIMIT 1
       ) loan ON true
       LEFT JOIN LATERAL (
         SELECT user_id FROM "reservations" WHERE book_id = b.id
           AND (status = 'waiting' OR (status = 'ready' AND expires_at > now()))
         ORDER BY position, created_at, id LIMIT 1
       ) next_reservation ON true
       WHERE b.provider = $3 AND b.provider_id = $1`,
      [remoteId, userId, provider],
    );
    return (
      result.rows[0] ?? {
        borrower_id: null,
        reservation_user_id: null,
        has_reservation: false,
      }
    );
  }

  async createReference(
    providerId: string,
    book: Book,
    executor: RepositoryExecutor,
  ): Promise<string> {
    const { provider, remoteId } = parseBookProviderId(providerId);
    await this.executor(executor).query(
      `INSERT INTO "books" (provider, provider_id, title, author, description, cover_url)
       VALUES ($6, $1, $2, $3, $4, $5)
       ON CONFLICT (provider, provider_id) DO NOTHING`,
      [
        remoteId,
        book.title.slice(0, 500),
        book.authors.join(', ').slice(0, 500),
        book.description,
        book.coverUrl,
        provider,
      ],
    );
    const result = await this.executor(executor).query<{ id: string }>(
      `SELECT id FROM "books" WHERE provider = $2 AND provider_id = $1 FOR UPDATE`,
      [remoteId, provider],
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
