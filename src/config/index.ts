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
    url: process.env['REDIS_URL'] ?? null,
    host: optionalEnv('REDIS_HOST', 'localhost'),
    port: parseInt(optionalEnv('REDIS_PORT', '6379'), 10),
    password: optionalEnv('REDIS_PASSWORD', ''),
  },

  claude: {
    apiKey: requireEnv('ANTHROPIC_API_KEY'),
    model: optionalEnv('CLAUDE_MODEL', 'claude-haiku-4-5'),
    maxTokens: parseInt(optionalEnv('CLAUDE_MAX_TOKENS', '4096'), 10),
  },

  costs: {
    // Cotação USD → BRL usada para exibir valores em reais no módulo ai-costs.
    // Atualize via variável de ambiente USD_BRL_RATE conforme o mercado.
    usdToBrlRate: parseFloat(optionalEnv('USD_BRL_RATE', '5.90')),
  },

  billing: {
    /** Allow /billing/recharge in all environments */
    frontendUrl: optionalEnv('FRONTEND_URL', 'http://localhost:5173'),
  },

  google: {
    clientId: optionalEnv('GOOGLE_CLIENT_ID', ''),
    clientSecret: optionalEnv('GOOGLE_CLIENT_SECRET', ''),
    callbackUrl: optionalEnv(
      'GOOGLE_CALLBACK_URL',
      'http://localhost:3000/api/auth/google/callback',
    ),
  },

  email: {
    host: optionalEnv('SMTP_HOST', 'smtp.gmail.com'),
    port: parseInt(optionalEnv('SMTP_PORT', '587'), 10),
    user: optionalEnv('SMTP_USER', ''),
    pass: optionalEnv('SMTP_PASS', ''),
    from: optionalEnv('SMTP_FROM', 'Contracta <noreply@contracta.app>'),
  },
} as const;
