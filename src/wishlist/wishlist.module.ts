import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { BooksModule } from '../books/books.module.js';
import { WishlistController } from './wishlist.controller.js';
import { WishlistService } from './wishlist.service.js';
import { WishlistRepository } from './wishlist.repository.js';

@Module({
  imports: [AuthModule, BooksModule],
  controllers: [WishlistController],
  providers: [WishlistService, WishlistRepository],
})
export class WishlistModule {}
