import { Inject, Injectable, Logger } from '@nestjs/common';
import type { OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import type { PoolClient } from 'pg';
import { DatabaseService } from '../database/database.service.js';
import { BooksRepository } from '../books/books.repository.js';
import { LoansRepository } from '../loans/loans.repository.js';
import { ReservationsRepository } from './reservations.repository.js';

@Injectable()
export class ReservationQueueService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ReservationQueueService.name);
  private timer?: ReturnType<typeof setInterval>;
  private running = false;

  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(BooksRepository) private readonly books: BooksRepository,
    @Inject(LoansRepository) private readonly loans: LoansRepository,
    @Inject(ReservationsRepository)
    private readonly reservations: ReservationsRepository,
  ) {}

  onModuleInit() {
    this.timer = setInterval(() => {
      if (this.running) return;
      this.running = true;
      void this.refresh()
        .catch(() => this.logger.error('Library maintenance failed.'))
        .finally(() => {
          this.running = false;
        });
    }, 60_000);
    this.timer.unref();
  }

  onModuleDestroy() {
    clearInterval(this.timer);
  }

  async refresh(userId: string | null = null) {
    await this.loans.markOverdueAll();
    const books = await this.reservations.findBookIdsForRefresh(userId);
    for (const book of books) {
      await this.database.transaction(async (client) => {
        await this.books.lockById(book.book_id, client);
        await this.sync(client, book.book_id);
      });
    }
  }

  async sync(client: PoolClient, bookId: string) {
    await this.reservations.expireReady(bookId, client);
    await this.reservations.reorder(bookId, client);
    const loan = await this.loans.findActiveByBook(bookId, client);
    const queue = await this.reservations.findNext(bookId, client);
    
    if (!loan.rows.length && queue.rows[0]?.status === 'waiting') {
      await this.reservations.markReady(queue.rows[0].id, client);
    }
    await this.books.setAvailability(
      bookId,
      !loan.rows.length && !queue.rows.length,
      client,
    );
  }
}
