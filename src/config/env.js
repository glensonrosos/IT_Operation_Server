import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(5000),
  TRUST_PROXY: z.string().default('false'),
  MONGO_URI: z.string().min(1),
  CLIENT_URL: z.string().url(),
  DEV_PREVIEW_ORIGINS: z.string().default(''),
  JWT_SECRET: z.string().min(32),
  JWT_EXPIRES_IN: z.string().regex(/^\d+[smhd]$/).default('30d'),
  JWT_COOKIE_NAME: z.string().regex(/^[A-Za-z0-9_]+$/).default('itms_session'),
  BCRYPT_ROUNDS: z.coerce.number().int().min(10).max(14).default(12),
  LOGIN_MAX_ATTEMPTS: z.coerce.number().int().min(3).max(20).default(5),
  LOCKOUT_MINUTES: z.coerce.number().int().min(1).max(1440).default(15),
  INITIAL_ADMIN_USERNAME: z.string().optional(),
  INITIAL_ADMIN_EMAIL: z.string().email().optional(),
  INITIAL_ADMIN_FIRST_NAME: z.string().optional(),
  INITIAL_ADMIN_LAST_NAME: z.string().optional(),
  INITIAL_ADMIN_PASSWORD: z.string().optional(),
  UPLOAD_DIR: z.string().min(1).default('uploads'),
  COOKIE_SECURE: z.enum(['true', 'false']).optional(),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info')
});

const result = envSchema.superRefine((value, context) => {
  if (value.NODE_ENV === 'production' && value.JWT_SECRET === 'replace-with-at-least-32-random-bytes') {
    context.addIssue({ code: 'custom', path: ['JWT_SECRET'], message: 'Set a unique production JWT secret' });
  }
}).safeParse(process.env);

if (!result.success) {
  console.error('Invalid environment configuration:', result.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = Object.freeze(result.data);
