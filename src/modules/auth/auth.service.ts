/**
 * Auth Service
 *
 * Contains all authentication business logic.
 * Depends on: UserModel (MongoDB), redisService (token storage), config (JWT).
 *
 * Refresh token strategy:
 *  - On login, a refresh token (UUID v4, stored in Redis) is issued alongside
 *    the short-lived JWT access token.
 *  - Redis key: `rt:{userId}:{tokenId}` with TTL matching refreshExpiresIn.
 *  - On refresh, we verify the token exists in Redis, invalidate it (rotation),
 *    and issue a fresh pair.
 *  - On logout, the refresh token is deleted from Redis immediately.
 */

import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { UserModel, IUser, UserRole } from './models/user.model';
import { redisService } from '../../infra/redis/redis.service';
import { config } from '../../config';
import { RegisterDto, LoginDto } from './auth.dto';
import { PlanModel, PLAN_SLUGS } from '../billing/models/plan.model';
import { emailService } from './email.service';

const BCRYPT_ROUNDS = 12;

// Convert JWT duration strings to seconds for Redis TTL
function durationToSeconds(duration: string): number {
  const unit = duration.slice(-1);
  const value = parseInt(duration.slice(0, -1), 10);
  const map: Record<string, number> = { s: 1, m: 60, h: 3600, d: 86400 };
  return value * (map[unit] ?? 60);
}

function refreshTokenKey(userId: string, tokenId: string): string {
  return `rt:${userId}:${tokenId}`;
}

function emailVerifyKey(userId: string): string {
  return `email_verify:${userId}`;
}

function passwordResetKey(token: string): string {
  return `pwd_reset:${token}`;
}

function generateVerificationCode(): string {
  // crypto.randomInt is cryptographically secure (unlike Math.random)
  return String(crypto.randomInt(100000, 1000000));
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export class AuthService {
  async register(dto: RegisterDto): Promise<{ userId: string; email: string }> {
    const existing = await UserModel.findOne({ email: dto.email });
    if (existing) {
      throw Object.assign(new Error('Email already in use'), { statusCode: 409 });
    }

    // First user ever registered becomes admin (bootstrap)
    const count = await UserModel.countDocuments();
    const role: UserRole = count === 0 ? 'admin' : 'user';

    // Assign free plan on registration
    const freePlan = await PlanModel.findOne({ slug: PLAN_SLUGS.FREE }).catch(() => null);

    const isProduction = config.nodeEnv === 'production';

    const hashed = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
    const user = await UserModel.create({
      email: dto.email,
      password: hashed,
      name: dto.name ?? null,
      role,
      emailVerified: !isProduction,
      planId: freePlan?._id ?? null,
      creditsRemaining: freePlan?.creditAmount ?? 2,
    });

    if (isProduction) {
      // Persist the code first (must be awaited — Redis is fast and local)
      const code = generateVerificationCode();
      await redisService.set(emailVerifyKey(user._id.toString()), code, 900); // 15 min TTL

      // Fire-and-forget: email delivery must never block the HTTP response.
      // Errors are logged but do not propagate to the caller.
      emailService
        .sendVerificationCode(user.email, code, user.name)
        .catch((err: unknown) =>
          console.error('[AuthService] Failed to send verification email:', (err as Error).message),
        );
    }

    return { userId: user._id.toString(), email: user.email };
  }

  async sendVerificationCode(userId: string): Promise<void> {
    const user = await UserModel.findById(userId);
    if (!user) throw Object.assign(new Error('User not found'), { statusCode: 404 });
    if (user.emailVerified)
      throw Object.assign(new Error('Email already verified'), { statusCode: 400 });

    const code = generateVerificationCode();
    await redisService.set(emailVerifyKey(userId), code, 900);

    // Fire-and-forget — same rationale as register()
    emailService
      .sendVerificationCode(user.email, code, user.name)
      .catch((err: unknown) =>
        console.error('[AuthService] Failed to resend verification email:', (err as Error).message),
      );
  }

  async verifyEmail(userId: string, code: string): Promise<AuthTokens> {
    const stored = await redisService.get(emailVerifyKey(userId));
    if (!stored || stored !== code) {
      throw Object.assign(new Error('Invalid or expired verification code'), { statusCode: 400 });
    }

    const user = await UserModel.findByIdAndUpdate(userId, { emailVerified: true }, { new: true });
    if (!user) throw Object.assign(new Error('User not found'), { statusCode: 404 });

    await redisService.del(emailVerifyKey(userId));
    return this.generateTokens(user._id.toString(), user.role);
  }

  /**
   * Find or create a user authenticated via Google OAuth.
   * Returns JWT tokens ready to be sent to the client.
   */
  async googleAuth(profile: {
    googleId: string;
    email: string;
    name: string | null;
  }): Promise<AuthTokens> {
    let user = await UserModel.findOne({
      $or: [{ googleId: profile.googleId }, { email: profile.email }],
    });

    if (!user) {
      const count = await UserModel.countDocuments();
      const role: UserRole = count === 0 ? 'admin' : 'user';
      const freePlan = await PlanModel.findOne({ slug: PLAN_SLUGS.FREE }).catch(() => null);

      user = await UserModel.create({
        email: profile.email,
        password: uuidv4(), // random — never used for login
        name: profile.name,
        googleId: profile.googleId,
        emailVerified: true, // Google already verified the email
        role,
        planId: freePlan?._id ?? null,
        creditsRemaining: freePlan?.creditAmount ?? 2,
      });
    } else if (!user.googleId) {
      // Existing email-based account — link Google ID
      const updated = await UserModel.findByIdAndUpdate(
        user._id,
        { googleId: profile.googleId, emailVerified: true, name: user.name ?? profile.name },
        { new: true },
      );
      if (!updated) throw Object.assign(new Error('User not found'), { statusCode: 404 });
      user = updated;
    }

    return this.generateTokens(user._id.toString(), user.role);
  }

  async login(dto: LoginDto): Promise<AuthTokens> {
    // .select('+password') is required since password has `select: false`
    const user = await UserModel.findOne({ email: dto.email }).select('+password');
    if (!user) {
      throw Object.assign(new Error('Invalid credentials'), { statusCode: 401 });
    }

    if (!user.password) {
      // Google-only account — no password set
      throw Object.assign(new Error('This account uses Google login'), { statusCode: 401 });
    }

    const passwordMatch = await bcrypt.compare(dto.password, user.password);
    if (!passwordMatch) {
      throw Object.assign(new Error('Invalid credentials'), { statusCode: 401 });
    }

    if (!user.emailVerified && config.nodeEnv === 'production') {
      throw Object.assign(
        Object.assign(new Error('Email not verified'), {
          statusCode: 403,
          code: 'EMAIL_NOT_VERIFIED',
          userId: user._id.toString(),
        }),
        {},
      );
    }

    return this.generateTokens(user._id.toString(), user.role);
  }

  async refresh(incomingRefreshToken: string): Promise<AuthTokens> {
    let payload: { userId: string; tokenId: string };

    try {
      payload = jwt.verify(incomingRefreshToken, config.jwt.refreshSecret) as typeof payload;
    } catch {
      throw Object.assign(new Error('Invalid or expired refresh token'), { statusCode: 401 });
    }

    const key = refreshTokenKey(payload.userId, payload.tokenId);
    const stored = await redisService.get(key);

    if (!stored) {
      // Token was already used or revoked — possible token reuse attack
      throw Object.assign(new Error('Refresh token revoked'), { statusCode: 401 });
    }

    // Rotate: delete the old token before issuing a new pair
    await redisService.del(key);

    // Fetch current role from DB to keep it accurate after potential promotions
    const user = await UserModel.findById(payload.userId).select('role');
    const role: UserRole = (user?.role as UserRole) ?? 'user';

    return this.generateTokens(payload.userId, role);
  }

  async logout(refreshToken: string): Promise<void> {
    try {
      const payload = jwt.verify(refreshToken, config.jwt.refreshSecret) as {
        userId: string;
        tokenId: string;
      };
      await redisService.del(refreshTokenKey(payload.userId, payload.tokenId));
    } catch {
      // If the token is invalid we consider it already gone — not an error
    }
  }

  private generateTokens(userId: string, role: UserRole): AuthTokens {
    const tokenId = uuidv4();

    const accessToken = jwt.sign({ userId, role }, config.jwt.secret, {
      expiresIn: config.jwt.expiresIn as jwt.SignOptions['expiresIn'],
    });

    const refreshToken = jwt.sign({ userId, tokenId, role }, config.jwt.refreshSecret, {
      expiresIn: config.jwt.refreshExpiresIn as jwt.SignOptions['expiresIn'],
    });

    // Persist refresh token in Redis
    const ttl = durationToSeconds(config.jwt.refreshExpiresIn);
    redisService.set(refreshTokenKey(userId, tokenId), '1', ttl).catch(() => {
      // Non-blocking — if Redis is down the user can still get tokens
      // but refresh will fail until Redis recovers
    });

    return { accessToken, refreshToken };
  }

  async promoteUser(targetUserId: string, role: UserRole): Promise<IUser> {
    const user = await UserModel.findByIdAndUpdate(
      targetUserId,
      { role },
      { new: true, runValidators: true },
    );
    if (!user) {
      throw Object.assign(new Error('User not found'), { statusCode: 404 });
    }
    return user;
  }

  async findById(userId: string): Promise<IUser | null> {
    return UserModel.findById(userId);
  }

  /**
   * POST /forgot-password
   * Generates a secure reset token, stores it in Redis (1 h TTL), and sends
   * a link to the user's email. Never reveals whether the email exists.
   */
  async forgotPassword(email: string): Promise<void> {
    const user = await UserModel.findOne({ email: email.toLowerCase().trim() });

    // Always resolve successfully to avoid email-enumeration attacks
    if (!user) return;

    // Google-only accounts have no password — skip silently
    if (!user.password) return;

    const token = crypto.randomBytes(32).toString('hex');
    await redisService.set(passwordResetKey(token), user._id.toString(), 3600); // 1 h TTL

    const resetUrl = `${config.billing.frontendUrl}/reset-password?token=${token}`;

    emailService
      .sendPasswordReset(user.email, user.name, resetUrl)
      .catch((err: unknown) =>
        console.error('[AuthService] Failed to send password reset email:', (err as Error).message),
      );
  }

  /**
   * POST /reset-password
   * Validates the token, hashes the new password, updates the user, and
   * removes the token from Redis so it cannot be reused.
   */
  async resetPassword(token: string, newPassword: string): Promise<void> {
    const userId = await redisService.get(passwordResetKey(token));
    if (!userId) {
      throw Object.assign(new Error('Invalid or expired reset token'), { statusCode: 400 });
    }

    const hashed = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
    const user = await UserModel.findByIdAndUpdate(userId, { password: hashed });
    if (!user) {
      throw Object.assign(new Error('User not found'), { statusCode: 404 });
    }

    await redisService.del(passwordResetKey(token));
  }
}

export const authService = new AuthService();
