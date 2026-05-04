/**
 * AI Costs Controller
 *
 * Handles all GET /api/v1/ai-costs/* endpoints.
 * User routes return data scoped to the authenticated user.
 * Admin routes (/admin/*) have no userId restriction and can be filtered by ?userId=.
 *
 * Common query params:
 *   from    — ISO date string (e.g. "2025-01-01")
 *   to      — ISO date string (e.g. "2025-12-31") — inclusive, extended to end of day
 *   timezone — IANA timezone for daily/monthly grouping (default: America/Sao_Paulo)
 *
 * Admin-only extras:
 *   userId  — filter by a specific user's ObjectId
 *   page, limit — pagination for /admin/requests
 */

import { Request, Response, NextFunction } from 'express';
import { aiCostsService } from './ai-costs.service';
import { AuthenticatedRequest } from '../../shared/middleware/auth.middleware';
import { ApiResponse } from '../../shared/utils/response.util';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function parseDate(raw: unknown, endOfDay = false): Date | undefined {
  if (!raw || typeof raw !== 'string') return undefined;
  const d = new Date(raw);
  if (isNaN(d.getTime())) return undefined;
  if (endOfDay) {
    d.setUTCHours(23, 59, 59, 999);
  }
  return d;
}

function parsePagination(query: Record<string, unknown>): { page: number; limit: number } {
  const page = Math.max(1, parseInt(String(query['page'] ?? '1'), 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(String(query['limit'] ?? '50'), 10) || 50));
  return { page, limit };
}

// ─── Controller ──────────────────────────────────────────────────────────────

export const aiCostsController = {
  // ── User: overall summary ──────────────────────────────────────────────────

  async summary(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { userId } = req as AuthenticatedRequest;
      const q = req.query as Record<string, unknown>;

      const data = await aiCostsService.getSummary({
        userId,
        from: parseDate(q['from']),
        to: parseDate(q['to'], true),
      });

      res.json(ApiResponse.success(data));
    } catch (err) {
      next(err);
    }
  },

  // ── User: per-request list ─────────────────────────────────────────────────

  async requests(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { userId } = req as AuthenticatedRequest;
      const q = req.query as Record<string, unknown>;
      const { page, limit } = parsePagination(q);

      const data = await aiCostsService.getRequests({
        userId,
        page,
        limit,
        from: parseDate(q['from']),
        to: parseDate(q['to'], true),
      });

      res.json(ApiResponse.success(data));
    } catch (err) {
      next(err);
    }
  },

  // ── User: daily breakdown ──────────────────────────────────────────────────

  async daily(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { userId } = req as AuthenticatedRequest;
      const q = req.query as Record<string, unknown>;

      const data = await aiCostsService.getDailyBreakdown({
        userId,
        from: parseDate(q['from']),
        to: parseDate(q['to'], true),
        timezone: typeof q['timezone'] === 'string' ? q['timezone'] : undefined,
      });

      res.json(ApiResponse.success(data));
    } catch (err) {
      next(err);
    }
  },

  // ── User: weekly breakdown ─────────────────────────────────────────────────

  async weekly(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { userId } = req as AuthenticatedRequest;
      const q = req.query as Record<string, unknown>;

      const data = await aiCostsService.getWeeklyBreakdown({
        userId,
        from: parseDate(q['from']),
        to: parseDate(q['to'], true),
      });

      res.json(ApiResponse.success(data));
    } catch (err) {
      next(err);
    }
  },

  // ── User: monthly breakdown ────────────────────────────────────────────────

  async monthly(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { userId } = req as AuthenticatedRequest;
      const q = req.query as Record<string, unknown>;

      const data = await aiCostsService.getMonthlyBreakdown({
        userId,
        from: parseDate(q['from']),
        to: parseDate(q['to'], true),
        timezone: typeof q['timezone'] === 'string' ? q['timezone'] : undefined,
      });

      res.json(ApiResponse.success(data));
    } catch (err) {
      next(err);
    }
  },

  // ── Admin: global summary (all users or filtered) ─────────────────────────

  async adminSummary(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const q = req.query as Record<string, unknown>;

      const data = await aiCostsService.getSummary({
        userId: typeof q['userId'] === 'string' ? q['userId'] : undefined,
        from: parseDate(q['from']),
        to: parseDate(q['to'], true),
      });

      res.json(ApiResponse.success(data));
    } catch (err) {
      next(err);
    }
  },

  // ── Admin: all requests (paginated, all users or filtered) ────────────────

  async adminRequests(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const q = req.query as Record<string, unknown>;
      const { page, limit } = parsePagination(q);

      const data = await aiCostsService.getAllRequests({
        page,
        limit,
        from: parseDate(q['from']),
        to: parseDate(q['to'], true),
        filterUserId: typeof q['userId'] === 'string' ? q['userId'] : undefined,
      });

      res.json(ApiResponse.success(data));
    } catch (err) {
      next(err);
    }
  },

  // ── Admin: daily breakdown (all users or filtered) ────────────────────────

  async adminDaily(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const q = req.query as Record<string, unknown>;

      const data = await aiCostsService.getDailyBreakdown({
        userId: typeof q['userId'] === 'string' ? q['userId'] : undefined,
        from: parseDate(q['from']),
        to: parseDate(q['to'], true),
        timezone: typeof q['timezone'] === 'string' ? q['timezone'] : undefined,
      });

      res.json(ApiResponse.success(data));
    } catch (err) {
      next(err);
    }
  },

  // ── Admin: weekly breakdown (all users or filtered) ───────────────────────

  async adminWeekly(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const q = req.query as Record<string, unknown>;

      const data = await aiCostsService.getWeeklyBreakdown({
        userId: typeof q['userId'] === 'string' ? q['userId'] : undefined,
        from: parseDate(q['from']),
        to: parseDate(q['to'], true),
      });

      res.json(ApiResponse.success(data));
    } catch (err) {
      next(err);
    }
  },

  // ── Admin: monthly breakdown (all users or filtered) ─────────────────────

  async adminMonthly(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const q = req.query as Record<string, unknown>;

      const data = await aiCostsService.getMonthlyBreakdown({
        userId: typeof q['userId'] === 'string' ? q['userId'] : undefined,
        from: parseDate(q['from']),
        to: parseDate(q['to'], true),
        timezone: typeof q['timezone'] === 'string' ? q['timezone'] : undefined,
      });

      res.json(ApiResponse.success(data));
    } catch (err) {
      next(err);
    }
  },

  // ── Admin: breakdown by user ──────────────────────────────────────────────

  async adminByUser(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const q = req.query as Record<string, unknown>;

      const data = await aiCostsService.getByUserBreakdown({
        from: parseDate(q['from']),
        to: parseDate(q['to'], true),
      });

      res.json(ApiResponse.success(data));
    } catch (err) {
      next(err);
    }
  },
};
