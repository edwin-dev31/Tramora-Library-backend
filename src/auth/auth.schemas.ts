import { z } from 'zod';

const email = z
  .email()
  .max(255)
  .transform((value) => value.toLowerCase());
const password = z
  .string()
  .min(8)
  .refine(
    (value) => Buffer.byteLength(value, 'utf8') <= 72,
    'Password must not exceed 72 UTF-8 bytes.',
  );

export const registerSchema = z.strictObject({
  name: z.string().trim().min(1).max(255),
  email,
  password,
});
export const loginSchema = z.strictObject({ email, password });
export type RegisterDto = z.infer<typeof registerSchema>;
export type LoginDto = z.infer<typeof loginSchema>;
export interface AuthUser {
  id: string;
  name: string;
  email: string;
}
