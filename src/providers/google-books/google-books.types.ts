import { z } from 'zod';

// Validate upstream payloads so invalid JSON shapes trigger the fallback as well.
export const googleBookSchema = z.object({
  id: z.string().min(1),
  volumeInfo: z
    .object({
      title: z.string().optional(),
      authors: z.array(z.string()).optional(),
      publishedDate: z.string().optional(),
      description: z.string().optional(),
      imageLinks: z
        .object({
          thumbnail: z.string().optional(),
          smallThumbnail: z.string().optional(),
        })
        .optional(),
    })
    .optional(),
});

export const googleBooksResponseSchema = z.object({
  totalItems: z.number().int().nonnegative(),
  items: z.array(googleBookSchema).optional(),
});

export type GoogleBooksResponse = z.infer<typeof googleBooksResponseSchema>;
export type GoogleBook = z.infer<typeof googleBookSchema>;
