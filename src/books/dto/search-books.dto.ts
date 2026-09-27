import { z } from 'zod';
import { BookSearchField } from './book-search-field.enum.js';

export const searchBooksSchema = z.strictObject({
  query: z.string().trim().min(1).max(500),
  field: z.enum(BookSearchField).default(BookSearchField.ALL),
  limit: z
    .string()
    .regex(/^\d+$/)
    .pipe(z.coerce.number<string>().int().min(1).max(40))
    .optional()
    .transform((value) => value ?? 10),
  offset: z
    .string()
    .regex(/^\d+$/)
    .pipe(z.coerce.number<string>().int().min(0).max(2147483647))
    .optional()
    .transform((value) => value ?? 0),
});

export type SearchBooksDto = z.infer<typeof searchBooksSchema>;
