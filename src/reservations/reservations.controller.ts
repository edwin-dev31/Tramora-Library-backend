import {
  Body,
  Controller,
  Delete,
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
import { ReservationsService } from './reservations.service.js';
import {
  createReservationSchema,
  notificationSchema,
} from './reservations.schemas.js';
import type {
  CreateReservationDto,
  NotificationDto,
} from './reservations.schemas.js';
import { listQuerySchema } from '../common/pagination/list-query.dto.js';
import type { ListQueryDto } from '../common/pagination/list-query.dto.js';

@Controller('reservations')
@UseGuards(JwtAuthGuard)
export class ReservationsController {
  constructor(
    @Inject(ReservationsService)
    private readonly reservations: ReservationsService,
  ) {}

  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Body({ schema: createReservationSchema }) input: CreateReservationDto,
  ) {
    return this.reservations.create(user.id, input);
  }

  @Get('active')
  active(
    @CurrentUser() user: AuthUser,
    @Query({ schema: listQuerySchema }) query: ListQueryDto,
  ) {
    return this.reservations.list(user.id, false, query);
  }

  @Get('history')
  history(
    @CurrentUser() user: AuthUser,
    @Query({ schema: listQuerySchema }) query: ListQueryDto,
  ) {
    return this.reservations.list(user.id, true, query);
  }

  @Delete(':id')
  cancel(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.reservations.cancel(user.id, id);
  }

  @Put(':id/notifications')
  notifications(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body({ schema: notificationSchema }) input: NotificationDto,
  ) {
    return this.reservations.notifications(
      user.id,
      id,
      input.notificationsEnabled,
    );
  }
}
