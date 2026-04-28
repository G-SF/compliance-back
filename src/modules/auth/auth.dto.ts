/**
 * Auth DTOs (Data Transfer Objects)
 *
 * Lightweight validation using plain TypeScript types + a manual validator.
 * If the project grows, swap this for class-validator / zod / yup.
 */

export interface RegisterDto {
  email: string;
  password: string;
}

export interface LoginDto {
  email: string;
  password: string;
}

export interface RefreshTokenDto {
  refreshToken: string;
}

// ── Validation helpers ──────────────────────────────────────────────────────

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateRegisterDto(body: unknown): RegisterDto {
  const dto = body as Record<string, unknown>;

  if (!dto.email || typeof dto.email !== 'string' || !EMAIL_REGEX.test(dto.email)) {
    throw Object.assign(new Error('A valid email is required'), { statusCode: 400 });
  }
  if (!dto.password || typeof dto.password !== 'string' || dto.password.length < 8) {
    throw Object.assign(new Error('Password must be at least 8 characters'), { statusCode: 400 });
  }

  return { email: dto.email.toLowerCase().trim(), password: dto.password };
}

export function validateLoginDto(body: unknown): LoginDto {
  const dto = body as Record<string, unknown>;

  if (!dto.email || typeof dto.email !== 'string') {
    throw Object.assign(new Error('Email is required'), { statusCode: 400 });
  }
  if (!dto.password || typeof dto.password !== 'string') {
    throw Object.assign(new Error('Password is required'), { statusCode: 400 });
  }

  return { email: dto.email.toLowerCase().trim(), password: dto.password };
}

export function validateRefreshTokenDto(body: unknown): RefreshTokenDto {
  const dto = body as Record<string, unknown>;

  if (!dto.refreshToken || typeof dto.refreshToken !== 'string') {
    throw Object.assign(new Error('refreshToken is required'), { statusCode: 400 });
  }

  return { refreshToken: dto.refreshToken };
}
