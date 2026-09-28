import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { AuthUser } from '../auth/auth.schemas.js';
import { bookReferenceSchema } from '../books/dto/book-reference.dto.js';
import type { BookReferenceDto } from '../books/dto/book-reference.dto.js';
import { listQuerySchema } from '../common/pagination/list-query.dto.js';
import type { ListQueryDto } from '../common/pagination/list-query.dto.js';
import { loanHistorySchema } from './loans.schemas.js';
import type { LoanHistoryDto } from './loans.schemas.js';
import { LoansService } from './loans.service.js';

@Controller('loans')
@UseGuards(JwtAuthGuard)
export class LoansController {
  constructor(@Inject(LoansService) private readonly loans: LoansService) {}

  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Body({ schema: bookReferenceSchema }) input: BookReferenceDto,
  ) {
    return this.loans.create(user.id, input.bookId);
  }

  @Get('active')
  active(
    @CurrentUser() user: AuthUser,
    @Query({ schema: listQuerySchema }) query: ListQueryDto,
  ) {
    return this.loans.list(user.id, false, query);
  }

  @Get('history')
  history(
    @CurrentUser() user: AuthUser,
    @Query({ schema: loanHistorySchema }) query: LoanHistoryDto,
  ) {
    return this.loans.list(user.id, true, query);
  }

  @Get('reading')
  reading(
    @CurrentUser() user: AuthUser,
    @Query({ schema: listQuerySchema }) query: ListQueryDto,
  ) {
    return this.loans.reading(user.id, query);
  }

  @Put(':id/renew')
  renew(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.loans.update(user.id, id, 'renew');
  }

  @Put(':id/return')
  returnBook(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.loans.update(user.id, id, 'return');
  }
}
