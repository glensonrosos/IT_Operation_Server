import { z } from 'zod';

export const loginSchema = z.object({
  username: z.string().trim().min(3).max(254),
  password: z.string().min(1).max(72).refine((value) => Buffer.byteLength(value, 'utf8') <= 72, 'Password must not exceed 72 UTF-8 bytes')
}).strict();
