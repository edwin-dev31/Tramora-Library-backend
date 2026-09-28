import { z } from 'zod';

export const listQuerySchema = z.strictObject({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).max(2147483647).default(0),
});
export type ListQueryDto = z.infer<typeof listQuerySchema>;
