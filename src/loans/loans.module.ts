import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { BooksModule } from '../books/books.module.js';
import { ReservationsModule } from '../reservations/reservations.module.js';
import { LoansController } from './loans.controller.js';
import { LoansService } from './loans.service.js';
import { LoansRepository } from './loans.repository.js';

@Module({
  imports: [AuthModule, BooksModule, ReservationsModule],
  controllers: [LoansController],
  providers: [LoansService, LoansRepository],
})
export class LoansModule {}
