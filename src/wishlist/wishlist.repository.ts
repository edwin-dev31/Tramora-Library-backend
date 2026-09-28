import { Inject, Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service.js';
import { BaseRepository } from '../common/database/base.repository.js';
import type { RepositoryExecutor } from '../common/database/base.repository.js';
import type { WishlistQueryDto } from './wishlist.schemas.js';

export interface WishlistRecord {
  id: string;
  user_id: string;
  book_id: string;
  reading_status: 'want_to_read' | 'reading' | 'completed';
  wishlist: boolean;
}

@Injectable()
export class WishlistRepository extends BaseRepository<WishlistRecord> {
  constructor(@Inject(DatabaseService) database: DatabaseService) {
    super(database, 'user_book', [
      'id',
      'user_id',
      'book_id',
      'reading_status',
      'wishlist',
    ]);
  }

  upsert(
    userId: string,
    bookId: string,
    status: WishlistRecord['reading_status'],
    executor: RepositoryExecutor,
  ) {
    return this.executor(executor).query<WishlistRecord>(
      `INSERT INTO "user_book" (user_id, book_id, reading_status, wishlist) VALUES ($1, $2, $3, true)
       ON CONFLICT (user_id, book_id) DO UPDATE SET reading_status = EXCLUDED.reading_status, wishlist = true RETURNING *`,
      [userId, bookId, status],
    );
  }

  async listForUser(userId: string, query: WishlistQueryDto) {
    const result = await this.database.query(
      `SELECT ub.*, json_build_object('id', b.provider_id, 'title', b.title, 'author', b.author, 'coverUrl', b.cover_url) AS book
       FROM "user_book" ub JOIN "books" b ON b.id = ub.book_id
       WHERE ub.user_id = $1 AND ub.wishlist AND ($2::text IS NULL OR ub.reading_status = $2)
       ORDER BY b.title, ub.id LIMIT $3 OFFSET $4`,
      [userId, query.status ?? null, query.limit, query.offset],
    );
    return result.rows;
  }

  updateStatus(
    userId: string,
    id: string,
    status: WishlistRecord['reading_status'],
  ) {
    return this.database.query<WishlistRecord>(
      'UPDATE "user_book" SET reading_status = $3 WHERE id = $1 AND user_id = $2 AND wishlist RETURNING *',
      [id, userId, status],
    );
  }

  remove(userId: string, id: string) {
    return this.database.query<Pick<WishlistRecord, 'id'>>(
      'DELETE FROM "user_book" WHERE id = $1 AND user_id = $2 AND wishlist RETURNING id',
      [id, userId],
    );
  }
}
