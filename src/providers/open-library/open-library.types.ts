import { z } from 'zod';

export const openLibrarySearchBookSchema = z.object({
  key: z.string().regex(/^(?:\/works\/)?OL\d+W$/),
  title: z.string().optional(),
  author_name: z.array(z.string()).optional(),
  first_publish_year: z.number().int().optional(),
  cover_i: z.number().int().optional(),
});

export const openLibrarySearchSchema = z
  .object({
    numFound: z.number().int().nonnegative().optional(),
    num_found: z.number().int().nonnegative().optional(),
    docs: z.array(openLibrarySearchBookSchema),
  })
  .refine(
    (value) => value.numFound !== undefined || value.num_found !== undefined,
  );

export const openLibraryWorkSchema = z.object({
  key: z.string().regex(/^\/works\/OL\d+W$/),
  title: z.string(),
  description: z
    .union([z.string(), z.object({ value: z.string() })])
    .optional(),
  first_publish_date: z.string().optional(),
  covers: z.array(z.number().int()).optional(),
});

export type OpenLibrarySearchBook = z.infer<typeof openLibrarySearchBookSchema>;
export type OpenLibrarySearchResponse = z.infer<typeof openLibrarySearchSchema>;
export type OpenLibraryWork = z.infer<typeof openLibraryWorkSchema>;
