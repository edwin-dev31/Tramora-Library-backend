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
import { WishlistService } from './wishlist.service.js';
import {
  addWishlistSchema,
  updateWishlistSchema,
  wishlistQuerySchema,
} from './wishlist.schemas.js';
import type {
  AddWishlistDto,
  UpdateWishlistDto,
  WishlistQueryDto,
} from './wishlist.schemas.js';

@Controller('wishlist')
@UseGuards(JwtAuthGuard)
export class WishlistController {
  constructor(
    @Inject(WishlistService) private readonly wishlist: WishlistService,
  ) {}

  @Post()
  add(
    @CurrentUser() user: AuthUser,
    @Body({ schema: addWishlistSchema }) input: AddWishlistDto,
  ) {
    return this.wishlist.add(user.id, input);
  }

  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Query({ schema: wishlistQuerySchema }) query: WishlistQueryDto,
  ) {
    return this.wishlist.list(user.id, query);
  }

  @Put(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body({ schema: updateWishlistSchema }) input: UpdateWishlistDto,
  ) {
    return this.wishlist.update(user.id, id, input);
  }

  @Delete(':id')
  remove(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.wishlist.remove(user.id, id);
  }
}
