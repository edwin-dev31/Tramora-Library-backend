import {
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { DatabaseService } from '../database/database.service.js';
import { BookReferencesService } from '../books/book-references.service.js';
import { BooksRepository } from '../books/books.repository.js';
import { ReservationQueueService } from './reservation-queue.service.js';
import { ReservationsRepository } from './reservations.repository.js';
import type { CreateReservationDto } from './reservations.schemas.js';
import type { ListQueryDto } from '../common/pagination/list-query.dto.js';

@Injectable()
export class ReservationsService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(ReservationsRepository)
    private readonly reservations: ReservationsRepository,
    @Inject(BooksRepository) private readonly books: BooksRepository,
    @Inject(BookReferencesService)
    private readonly references: BookReferencesService,
    @Inject(ReservationQueueService)
    private readonly queue: ReservationQueueService,
  ) {}

  async create(userId: string, input: CreateReservationDto) {
    const reference = await this.references.prepare(input.bookId);
    return this.database.transaction(async (client) => {
      const bookId = await this.references.save(client, reference);
      await this.queue.sync(client, bookId);
      if (
        (await this.reservations.findOwnLoan(userId, bookId, client)).rows
          .length
      ) {
        throw new UnprocessableEntityException(
          'You already borrowed this book.',
        );
      }
      if (
        (await this.reservations.findDuplicate(userId, bookId, client)).rows
          .length
      ) {
        throw new UnprocessableEntityException(
          'You already reserved this book.',
        );
      }
      const book = await this.books.findById(bookId, client);
      if (book?.available)
        throw new UnprocessableEntityException(
          'Book is available. Borrow it directly.',
        );
      return (
        await this.reservations.createReservation(
          userId,
          bookId,
          input.notificationsEnabled,
          client,
        )
      ).rows[0];
    });
  }

  async list(userId: string, history: boolean, query: ListQueryDto) {
    await this.queue.refresh(userId);
    return this.reservations.listForUser(userId, history, query);
  }

  async cancel(userId: string, id: string) {
    const existing = await this.reservations.findOwned(userId, id);
    if (!existing.rows[0])
      throw new NotFoundException('Reservation not found.');
    return this.database.transaction(async (client) => {
      const bookId = existing.rows[0].book_id;
      await this.reservations.lockBook(bookId, client);
      await this.queue.sync(client, bookId);
      const result = await this.reservations.cancel(id, userId, client);
      if (!result.rows[0])
        throw new UnprocessableEntityException(
          'Reservation is no longer active.',
        );
      await this.queue.sync(client, bookId);
      return result.rows[0];
    });
  }

  async notifications(userId: string, id: string, enabled: boolean) {
    const result = await this.reservations.updateNotifications(
      userId,
      id,
      enabled,
    );
    if (!result.rows[0]) throw new NotFoundException('Reservation not found.');
    return result.rows[0];
  }
}
