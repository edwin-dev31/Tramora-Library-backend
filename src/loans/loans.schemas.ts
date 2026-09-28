import { z } from 'zod';
import { listQuerySchema } from '../common/pagination/list-query.dto.js';

export const loanHistorySchema = listQuerySchema
  .extend({
    from: z.iso.date().optional(),
    to: z.iso.date().optional(),
  })
  .refine(
    (value) => !value.from || !value.to || value.from <= value.to,
    'from must not be after to.',
  );
export type LoanHistoryDto = z.infer<typeof loanHistorySchema>;
