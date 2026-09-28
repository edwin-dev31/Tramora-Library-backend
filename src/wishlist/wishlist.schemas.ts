import { z } from 'zod';
import { bookReferenceSchema } from '../books/dto/book-reference.dto.js';
import { listQuerySchema } from '../common/pagination/list-query.dto.js';

export const readingStatusSchema = z.enum([
  'want_to_read',
  'reading',
  'completed',
]);
export const addWishlistSchema = bookReferenceSchema.extend({
  status: readingStatusSchema.default('want_to_read'),
});
export const updateWishlistSchema = z.strictObject({
  status: readingStatusSchema,
});
export const wishlistQuerySchema = listQuerySchema.extend({
  status: readingStatusSchema.optional(),
});
export type AddWishlistDto = z.infer<typeof addWishlistSchema>;
export type UpdateWishlistDto = z.infer<typeof updateWishlistSchema>;
export type WishlistQueryDto = z.infer<typeof wishlistQuerySchema>;
