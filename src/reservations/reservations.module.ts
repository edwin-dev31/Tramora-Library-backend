import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { BooksModule } from '../books/books.module.js';
import { ReservationsController } from './reservations.controller.js';
import { ReservationsService } from './reservations.service.js';
import { ReservationQueueService } from './reservation-queue.service.js';
import { ReservationsRepository } from './reservations.repository.js';
import { LoansRepository } from '../loans/loans.repository.js';

@Module({
  imports: [AuthModule, BooksModule],
  controllers: [ReservationsController],
  providers: [
    ReservationsService,
    ReservationQueueService,
    ReservationsRepository,
    LoansRepository,
  ],
  exports: [ReservationQueueService, ReservationsRepository],
})
export class ReservationsModule {}
