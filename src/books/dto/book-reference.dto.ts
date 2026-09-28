import { z } from 'zod';

// Public book IDs are Google Books volume IDs, not local database UUIDs.
export const providerIdSchema = z
  .string()
  .min(1)
  .max(255)
  .regex(/^[a-zA-Z0-9_-]+$/);
export const bookReferenceSchema = z.strictObject({ bookId: providerIdSchema });
export type BookReferenceDto = z.infer<typeof bookReferenceSchema>;
