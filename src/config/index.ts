/**
 * Centralised Configuration Module
 *
 * All environment variables are read and validated here.
 * The rest of the codebase imports `config` — never `process.env` directly.
 * This makes it trivial to swap the config source later (e.g. AWS Parameter Store).
 */

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

function optionalEnv(key: string, fallback: string): string {
  return process.env[key] ?? fallback;
}

export const config = {
  nodeEnv: optionalEnv('NODE_ENV', 'development'),
  port: parseInt(optionalEnv('PORT', '3000'), 10),

  jwt: {
    secret: requireEnv('JWT_SECRET'),
    expiresIn: optionalEnv('JWT_EXPIRES_IN', '15m'),
    refreshSecret: requireEnv('JWT_REFRESH_SECRET'),
    refreshExpiresIn: optionalEnv('JWT_REFRESH_EXPIRES_IN', '7d'),
  },

  mongo: {
    uri: requireEnv('MONGO_URI'),
  },

  redis: {
    host: optionalEnv('REDIS_HOST', 'localhost'),
    port: parseInt(optionalEnv('REDIS_PORT', '6379'), 10),
    password: optionalEnv('REDIS_PASSWORD', ''),
  },

  llm: {
    baseUrl: optionalEnv('LLM_BASE_URL', 'http://localhost:11434'),
    model: optionalEnv('LLM_MODEL', 'mistral'),
  },
} as const;
