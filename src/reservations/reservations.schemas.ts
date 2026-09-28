import { z } from 'zod';
import { bookReferenceSchema } from '../books/dto/book-reference.dto.js';

export const createReservationSchema = bookReferenceSchema.extend({
  notificationsEnabled: z.boolean().default(true),
});
export const notificationSchema = z.strictObject({
  notificationsEnabled: z.boolean(),
});
export type CreateReservationDto = z.infer<typeof createReservationSchema>;
export type NotificationDto = z.infer<typeof notificationSchema>;
