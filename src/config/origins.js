import { env } from './env.js';

const configuredOrigins = new Set([env.CLIENT_URL, ...env.DEV_PREVIEW_ORIGINS.split(',').map((value) => value.trim()).filter(Boolean)]);

export function isAllowedOrigin(origin) {
  if (!origin) return true;
  if (configuredOrigins.has(origin)) return true;
  if (env.NODE_ENV === 'development') {
    try {
      const url = new URL(origin);
      return (url.hostname === 'localhost' || url.hostname === '127.0.0.1') && Boolean(url.port);
    } catch {
      return false;
    }
  }
  return false;
}

export const allowedOrigins = [...configuredOrigins];
