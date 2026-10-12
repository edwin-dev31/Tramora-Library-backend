import { z } from 'zod';

// Existing Google volume IDs remain valid; Open Library works have a namespace.
export const providerIdSchema = z
  .string()
  .min(1)
  .max(255)
  .regex(/^(?:[a-zA-Z0-9_-]+|openlibrary:OL\d+W)$/);
export const bookReferenceSchema = z.strictObject({ bookId: providerIdSchema });
export type BookReferenceDto = z.infer<typeof bookReferenceSchema>;
