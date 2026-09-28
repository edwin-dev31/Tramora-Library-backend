import { Inject, Injectable } from '@nestjs/common';
import type { PoolClient } from 'pg';
import { BaseRepository } from '../common/database/base.repository.js';
import type { RepositoryExecutor } from '../common/database/base.repository.js';
import { DatabaseService } from '../database/database.service.js';
import type { LoanHistoryDto } from './loans.schemas.js';

export interface LoanRecord {
  id: string;
  user_id: string;
  book_id: string;
  loan_date: Date;
  due_date: Date;
  return_date: Date | null;
  renewal_count: number;
  status: 'active' | 'returned' | 'overdue';
  fine_amount: number;
}

@Injectable()
export class LoansRepository extends BaseRepository<LoanRecord> {
  constructor(@Inject(DatabaseService) database: DatabaseService) {
    super(database, 'loans', [
      'id',
      'user_id',
      'book_id',
      'loan_date',
      'due_date',
      'return_date',
      'renewal_count',
      'status',
      'fine_amount',
    ]);
  }

  lockUser(userId: string, executor: PoolClient) {
    return executor.query(
      'SELECT id FROM "users" WHERE id = $1 FOR NO KEY UPDATE',
      [userId],
    );
  }

  async countActiveByUser(
    userId: string,
    executor: RepositoryExecutor,
  ): Promise<number> {
    const result = await this.executor(executor).query<{ count: number }>(
      "SELECT count(*)::int AS count FROM \"loans\" WHERE user_id = $1 AND status IN ('active', 'overdue')",
      [userId],
    );
    return result.rows[0].count;
  }

  findActiveByBook(bookId: string, executor: RepositoryExecutor) {
    return this.executor(executor).query<Pick<LoanRecord, 'user_id'>>(
      "SELECT user_id FROM \"loans\" WHERE book_id = $1 AND status IN ('active', 'overdue')",
      [bookId],
    );
  }

  createLoan(userId: string, bookId: string, executor: RepositoryExecutor) {
    return this.executor(executor).query<LoanRecord>(
      'INSERT INTO "loans" (user_id, book_id, due_date) VALUES ($1, $2, now() + interval \'14 days\') RETURNING *',
      [userId, bookId],
    );
  }

  markOverdueForUser(userId: string) {
    return this.database.query(
      "UPDATE \"loans\" SET status = 'overdue' WHERE user_id = $1 AND status = 'active' AND due_date < now()",
      [userId],
    );
  }

  markOverdueAll() {
    return this.database.query(
      "UPDATE \"loans\" SET status = 'overdue' WHERE status = 'active' AND due_date < now()",
    );
  }

  async listForUser(userId: string, history: boolean, query: LoanHistoryDto) {
    const result = await this.database.query(
      `SELECT l.*, json_build_object('id', b.provider_id, 'title', b.title, 'author', b.author, 'coverUrl', b.cover_url) AS book
       FROM "loans" l JOIN "books" b ON b.id = l.book_id
       WHERE l.user_id = $1 AND ((l.status = 'returned') = $2)
         AND ($3::date IS NULL OR l.loan_date >= $3::date)
         AND ($4::date IS NULL OR l.loan_date < $4::date + interval '1 day')
       ORDER BY l.loan_date DESC, l.id LIMIT $5 OFFSET $6`,
      [
        userId,
        history,
        query.from ?? null,
        query.to ?? null,
        query.limit,
        query.offset,
      ],
    );
    return result.rows;
  }

  async listReading(userId: string, limit: number, offset: number) {
    const result = await this.database.query(
      `SELECT ub.id, ub.reading_status, json_build_object('id', b.provider_id, 'title', b.title, 'author', b.author, 'coverUrl', b.cover_url) AS book
       FROM "user_book" ub JOIN "books" b ON b.id = ub.book_id
       WHERE ub.user_id = $1 AND ub.reading_status = 'reading'
       ORDER BY b.title, ub.id LIMIT $2 OFFSET $3`,
      [userId, limit, offset],
    );
    return result.rows;
  }

  async findOwned(userId: string, id: string) {
    const result = await this.database.query<Pick<LoanRecord, 'book_id'>>(
      'SELECT book_id FROM "loans" WHERE id = $1 AND user_id = $2',
      [id, userId],
    );
    return result.rows[0] ?? null;
  }

  async lockOwned(id: string, userId: string, executor: PoolClient) {
    const result = await executor.query<
      Pick<LoanRecord, 'status' | 'renewal_count'>
    >(
      'SELECT status, renewal_count FROM "loans" WHERE id = $1 AND user_id = $2 FOR UPDATE',
      [id, userId],
    );
    return result.rows[0] ?? null;
  }

  renew(id: string, executor: RepositoryExecutor) {
    return this.executor(executor).query<LoanRecord>(
      `UPDATE "loans" SET renewal_count = renewal_count + 1, due_date = due_date + interval '14 days',
       status = CASE WHEN due_date + interval '14 days' < now() THEN 'overdue' ELSE 'active' END
       WHERE id = $1 RETURNING *`,
      [id],
    );
  }

  return(id: string, executor: RepositoryExecutor) {
    return this.executor(executor).query<LoanRecord>(
      `UPDATE "loans" SET status = 'returned', return_date = now(),
       fine_amount = GREATEST(0, CEIL(EXTRACT(EPOCH FROM (now() - due_date)) / 86400))
       WHERE id = $1 RETURNING *`,
      [id],
    );
  }
}
