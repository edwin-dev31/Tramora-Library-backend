import {
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { DatabaseService } from '../database/database.service.js';
import { BookReferencesService } from '../books/book-references.service.js';
import { BooksRepository } from '../books/books.repository.js';
import { ReservationQueueService } from '../reservations/reservation-queue.service.js';
import { ReservationsRepository } from '../reservations/reservations.repository.js';
import { LoansRepository } from './loans.repository.js';
import type { LoanHistoryDto } from './loans.schemas.js';
import type { ListQueryDto } from '../common/pagination/list-query.dto.js';

@Injectable()
export class LoansService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(LoansRepository) private readonly loans: LoansRepository,
    @Inject(ReservationsRepository)
    private readonly reservations: ReservationsRepository,
    @Inject(BooksRepository) private readonly books: BooksRepository,
    @Inject(BookReferencesService)
    private readonly references: BookReferencesService,
    @Inject(ReservationQueueService)
    private readonly queue: ReservationQueueService,
  ) {}

  async create(userId: string, providerId: string) {
    const reference = await this.references.prepare(providerId);
    return this.database.transaction(async (client) => {
      await this.loans.lockUser(userId, client);
      if ((await this.loans.countActiveByUser(userId, client)) >= 5) {
        throw new UnprocessableEntityException(
          'Maximum of 5 active loans reached.',
        );
      }
      const bookId = await this.references.save(client, reference);
      await this.queue.sync(client, bookId);
      const current = await this.loans.findActiveByBook(bookId, client);
      if (current.rows.length) {
        throw new UnprocessableEntityException(
          current.rows[0].user_id === userId
            ? 'You already borrowed this book.'
            : 'Book is not available.',
        );
      }
      const reservation = await this.reservations.findReady(bookId, client);
      if (reservation.rows[0] && reservation.rows[0].user_id !== userId) {
        throw new UnprocessableEntityException(
          'Book is reserved for another user.',
        );
      }
      const loan = await this.loans.createLoan(userId, bookId, client);
      if (reservation.rows[0])
        await this.reservations.markCollected(reservation.rows[0].id, client);
      await this.queue.sync(client, bookId);
      return loan.rows[0];
    });
  }

  async list(userId: string, history: boolean, query: LoanHistoryDto) {
    await this.loans.markOverdueForUser(userId);
    return this.loans.listForUser(userId, history, query);
  }

  reading(userId: string, query: ListQueryDto) {
    return this.loans.listReading(userId, query.limit, query.offset);
  }

  async update(userId: string, id: string, action: 'renew' | 'return') {
    const existing = await this.loans.findOwned(userId, id);
    if (!existing) throw new NotFoundException('Loan not found.');
    
    return this.database.transaction(async (client) => {
      const bookId = existing.book_id;
      await this.loans.lockUser(userId, client);
      await this.books.lockById(bookId, client);
      const loan = await this.loans.lockOwned(id, userId, client);
      
      if (!loan) throw new NotFoundException('Loan not found.');
      if (loan.status === 'returned')
        throw new UnprocessableEntityException('Loan was already returned.');
      await this.queue.sync(client, bookId);
      
      if (action === 'renew') {
        if (loan.renewal_count >= 2)
          throw new UnprocessableEntityException(
            'Maximum of 2 renewals reached.',
          );
        const waiting = await this.reservations.findPending(bookId, client);
        if (waiting.rows.length)
          throw new UnprocessableEntityException(
            'Book has active reservations.',
          );
        
          return (await this.loans.renew(id, client)).rows[0];
      }
      const result = await this.loans.return(id, client);
      await this.queue.sync(client, bookId);
      
      return result.rows[0];
    });
  }
}
