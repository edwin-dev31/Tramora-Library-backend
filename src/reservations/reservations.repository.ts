import { Inject, Injectable } from '@nestjs/common';
import type { PoolClient } from 'pg';
import { BaseRepository } from '../common/database/base.repository.js';
import type { RepositoryExecutor } from '../common/database/base.repository.js';
import { DatabaseService } from '../database/database.service.js';
import type { ListQueryDto } from '../common/pagination/list-query.dto.js';

export interface ReservationRecord {
  id: string;
  user_id: string;
  book_id: string;
  created_at: Date;
  status: 'waiting' | 'ready' | 'expired' | 'collected' | 'cancelled';
  position: number;
  notifications_enabled: boolean;
  ready_at: Date | null;
  expires_at: Date | null;
}

@Injectable()
export class ReservationsRepository extends BaseRepository<ReservationRecord> {
  constructor(@Inject(DatabaseService) database: DatabaseService) {
    super(database, 'reservations', [
      'id',
      'user_id',
      'book_id',
      'created_at',
      'status',
      'position',
      'notifications_enabled',
      'ready_at',
      'expires_at',
    ]);
  }

  findOwnLoan(userId: string, bookId: string, executor: RepositoryExecutor) {
    return this.executor(executor).query(
      "SELECT id FROM \"loans\" WHERE user_id = $1 AND book_id = $2 AND status IN ('active', 'overdue')",
      [userId, bookId],
    );
  }

  findDuplicate(userId: string, bookId: string, executor: RepositoryExecutor) {
    return this.executor(executor).query(
      "SELECT id FROM \"reservations\" WHERE user_id = $1 AND book_id = $2 AND status IN ('waiting', 'ready')",
      [userId, bookId],
    );
  }

  findReady(bookId: string, executor: RepositoryExecutor) {
    return this.executor(executor).query<
      Pick<ReservationRecord, 'id' | 'user_id'>
    >(
      'SELECT id, user_id FROM "reservations" WHERE book_id = $1 AND status = \'ready\'',
      [bookId],
    );
  }

  findPending(bookId: string, executor: RepositoryExecutor) {
    return this.executor(executor).query(
      "SELECT id FROM \"reservations\" WHERE book_id = $1 AND status IN ('waiting', 'ready') LIMIT 1",
      [bookId],
    );
  }

  createReservation(
    userId: string,
    bookId: string,
    notifications: boolean,
    executor: RepositoryExecutor,
  ) {
    return this.executor(executor).query<ReservationRecord>(
      `INSERT INTO "reservations" (user_id, book_id, position, notifications_enabled)
       VALUES ($1, $2, (SELECT count(*) + 1 FROM "reservations" WHERE book_id = $2 AND status IN ('waiting', 'ready')), $3)
       RETURNING *`,
      [userId, bookId, notifications],
    );
  }

  async listForUser(userId: string, history: boolean, query: ListQueryDto) {
    const result = await this.database.query(
      `SELECT r.*, json_build_object('id', b.provider_id, 'title', b.title, 'author', b.author, 'coverUrl', b.cover_url) AS book,
         CASE WHEN r.status = 'ready' THEN r.ready_at
              WHEN r.status = 'waiting' THEN
                GREATEST(now(), COALESCE(
                  (SELECT due_date FROM "loans" WHERE book_id = r.book_id AND status IN ('active', 'overdue') LIMIT 1),
                  (SELECT expires_at FROM "reservations" WHERE book_id = r.book_id AND status = 'ready' LIMIT 1), now()))
                + (r.position - 1) * interval '14 days'
         END AS estimated_available_at
       FROM "reservations" r JOIN "books" b ON b.id = r.book_id
       WHERE r.user_id = $1 AND ((r.status IN ('waiting', 'ready')) = $2)
       ORDER BY r.created_at DESC, r.id LIMIT $3 OFFSET $4`,
      [userId, !history, query.limit, query.offset],
    );
    return result.rows;
  }

  findOwned(userId: string, id: string) {
    return this.database.query<Pick<ReservationRecord, 'book_id'>>(
      'SELECT book_id FROM "reservations" WHERE id = $1 AND user_id = $2',
      [id, userId],
    );
  }

  lockBook(bookId: string, executor: PoolClient) {
    return executor.query('SELECT id FROM "books" WHERE id = $1 FOR UPDATE', [
      bookId,
    ]);
  }

  cancel(id: string, userId: string, executor: RepositoryExecutor) {
    return this.executor(executor).query<ReservationRecord>(
      `UPDATE "reservations" SET status = 'cancelled'
       WHERE id = $1 AND user_id = $2 AND status IN ('waiting', 'ready') RETURNING *`,
      [id, userId],
    );
  }

  updateNotifications(id: string, userId: string, enabled: boolean) {
    return this.database.query<ReservationRecord>(
      'UPDATE "reservations" SET notifications_enabled = $3 WHERE id = $1 AND user_id = $2 RETURNING *',
      [id, userId, enabled],
    );
  }

  async findBookIdsForRefresh(userId: string | null) {
    const result = await this.database.query<{ book_id: string }>(
      `SELECT DISTINCT book_id FROM "reservations"
       WHERE status IN ('waiting', 'ready') AND ($1::uuid IS NULL OR user_id = $1) ORDER BY book_id`,
      [userId],
    );
    return result.rows;
  }

  expireReady(bookId: string, executor: RepositoryExecutor) {
    return this.executor(executor).query(
      `UPDATE "reservations" SET status = 'expired' WHERE book_id = $1 AND status = 'ready' AND expires_at <= now()`,
      [bookId],
    );
  }

  reorder(bookId: string, executor: RepositoryExecutor) {
    return this.executor(executor).query(
      `WITH ranked AS (
         SELECT id, row_number() OVER (ORDER BY position, created_at, id) AS position
         FROM "reservations" WHERE book_id = $1 AND status IN ('waiting', 'ready')
       ) UPDATE "reservations" r SET position = ranked.position FROM ranked WHERE r.id = ranked.id`,
      [bookId],
    );
  }

  findNext(bookId: string, executor: RepositoryExecutor) {
    return this.executor(executor).query<
      Pick<ReservationRecord, 'id' | 'status'>
    >(
      `SELECT id, status FROM "reservations" WHERE book_id = $1 AND status IN ('waiting', 'ready') ORDER BY position LIMIT 1`,
      [bookId],
    );
  }

  markReady(id: string, executor: RepositoryExecutor) {
    return this.executor(executor).query(
      `UPDATE "reservations" SET status = 'ready', ready_at = now(), expires_at = now() + interval '48 hours' WHERE id = $1`,
      [id],
    );
  }

  markCollected(id: string, executor: RepositoryExecutor) {
    return this.executor(executor).query(
      `UPDATE "reservations" SET status = 'collected' WHERE id = $1`,
      [id],
    );
  }
}
