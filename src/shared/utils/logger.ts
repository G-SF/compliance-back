/**
 * Logger Utility
 *
 * A lightweight wrapper around console that:
 *  - Adds ISO timestamps to every message
 *  - Prefixes log level labels
 *  - Skips debug output in production
 *
 * If the project grows, replace this with Winston or Pino by swapping
 * only this file — all imports remain unchanged.
 */

type LogLevel = 'info' | 'warn' | 'error' | 'debug';

function log(level: LogLevel, message: string, meta?: unknown): void {
  const isProd = process.env.NODE_ENV === 'production';

  // Suppress debug logs in production
  if (level === 'debug' && isProd) return;

  const timestamp = new Date().toISOString();
  const prefix = `[${timestamp}] [${level.toUpperCase()}]`;

  if (level === 'error') {
    // eslint-disable-next-line no-console
    console.error(prefix, message, meta ?? '');
  } else if (level === 'warn') {
    // eslint-disable-next-line no-console
    console.warn(prefix, message, meta ?? '');
  } else {
    // eslint-disable-next-line no-console
    console.log(prefix, message, meta ?? '');
  }
}

export const logger = {
  info: (message: string, meta?: unknown) => log('info', message, meta),
  warn: (message: string, meta?: unknown) => log('warn', message, meta),
  error: (message: string, meta?: unknown) => log('error', message, meta),
  debug: (message: string, meta?: unknown) => log('debug', message, meta),
};
