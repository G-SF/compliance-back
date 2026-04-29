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
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { UserModel, IUser, UserRole } from './models/user.model';
import { redisService } from '../../infra/redis/redis.service';
import { config } from '../../config';
import { RegisterDto, LoginDto } from './auth.dto';

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

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export class AuthService {
  async register(dto: RegisterDto): Promise<IUser> {
    const existing = await UserModel.findOne({ email: dto.email });
    if (existing) {
      throw Object.assign(new Error('Email already in use'), { statusCode: 409 });
    }

    // First user ever registered becomes admin (bootstrap)
    const count = await UserModel.countDocuments();
    const role: UserRole = count === 0 ? 'admin' : 'user';

    const hashed = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
    const user = await UserModel.create({ email: dto.email, password: hashed, role });

    return user;
  }

  async login(dto: LoginDto): Promise<AuthTokens> {
    // .select('+password') is required since password has `select: false`
    const user = await UserModel.findOne({ email: dto.email }).select('+password');
    if (!user) {
      throw Object.assign(new Error('Invalid credentials'), { statusCode: 401 });
    }

    const passwordMatch = await bcrypt.compare(dto.password, user.password);
    if (!passwordMatch) {
      throw Object.assign(new Error('Invalid credentials'), { statusCode: 401 });
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
}

export const authService = new AuthService();
