/**
 * Rate Limit Middleware
 *
 * Uses express-rate-limit to protect sensitive endpoints against:
 *  - Brute-force login attacks
 *  - OTP/verification-code guessing (6 digits = 1,000,000 possibilities)
 *  - Password-reset email flooding
 *  - General API abuse
 *
 * Windows are per-IP (default key generator). In a multi-instance deployment
 * swap the default in-memory store for a Redis store via `rate-limit-redis`.
 */

import rateLimit from 'express-rate-limit';

/** Generic handler message — does not reveal whether the limit is on logins, codes, etc. */
function tooManyRequestsHandler(message: string) {
  return {
    success: false,
    message,
    statusCode: 429,
  };
}

/**
 * Login — 10 attempts per IP per 15 minutes.
 * Prevents brute-force credential stuffing.
 */
export const loginRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 min
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: tooManyRequestsHandler(
    'Muitas tentativas de login. Aguarde 15 minutos e tente novamente.',
  ),
});

/**
 * Register — 5 accounts per IP per hour.
 * Limits mass account creation.
 */
export const registerRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 h
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: tooManyRequestsHandler(
    'Muitas contas criadas a partir deste IP. Aguarde 1 hora.',
  ),
});

/**
 * Email verification (verify-email + resend-code) — 10 attempts per IP per 15 minutes.
 * A 6-digit code has 1,000,000 possibilities. With 10 attempts / 15 min,
 * an attacker would need ~10,000 years to exhaust the space.
 */
export const verifyEmailRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: tooManyRequestsHandler(
    'Muitas tentativas de verificação. Aguarde 15 minutos.',
  ),
});

/**
 * Forgot-password — 5 requests per IP per 15 minutes.
 * Prevents email-bombing via the reset-link endpoint.
 */
export const forgotPasswordRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: tooManyRequestsHandler(
    'Muitas solicitações de redefinição de senha. Aguarde 15 minutos.',
  ),
});

/**
 * Reset-password — 5 attempts per IP per 15 minutes.
 * Tokens are single-use and stored in Redis, but this adds a second layer.
 */
export const resetPasswordRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: tooManyRequestsHandler(
    'Muitas tentativas de redefinição. Aguarde 15 minutos.',
  ),
});

/**
 * General API — 200 requests per IP per minute.
 * Applied globally as a last line of defence against general flooding.
 */
export const globalRateLimit = rateLimit({
  windowMs: 60 * 1000, // 1 min
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: tooManyRequestsHandler('Limite de requisições atingido. Aguarde 1 minuto.'),
});
