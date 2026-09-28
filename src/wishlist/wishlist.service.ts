import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service.js';
import { BookReferencesService } from '../books/book-references.service.js';
import { WishlistRepository } from './wishlist.repository.js';
import type {
  AddWishlistDto,
  WishlistQueryDto,
  UpdateWishlistDto,
} from './wishlist.schemas.js';

@Injectable()
export class WishlistService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(WishlistRepository) private readonly wishlist: WishlistRepository,
    @Inject(BookReferencesService)
    private readonly references: BookReferencesService,
  ) {}

  async add(userId: string, input: AddWishlistDto) {
    const reference = await this.references.prepare(input.bookId);
    return this.database.transaction(async (client) => {
      const bookId = await this.references.save(client, reference);
      return (await this.wishlist.upsert(userId, bookId, input.status, client))
        .rows[0];
    });
  }

  list(userId: string, query: WishlistQueryDto) {
    return this.wishlist.listForUser(userId, query);
  }

  async update(userId: string, id: string, input: UpdateWishlistDto) {
    const result = await this.wishlist.updateStatus(userId, id, input.status);
    if (!result.rows[0])
      throw new NotFoundException('Wishlist entry not found.');
    return result.rows[0];
  }

  async remove(userId: string, id: string) {
    const result = await this.wishlist.remove(userId, id);
    if (!result.rows[0])
      throw new NotFoundException('Wishlist entry not found.');
    return result.rows[0];
  }
}
