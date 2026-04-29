/**
 * History Controller
 *
 * GET /api/v1/history              — list own analyses (paginated)
 * GET /api/v1/history/:id          — get full details of own analysis
 * GET /api/v1/history/admin/all    — admin: list all analyses (paginated, filterable by userId)
 */

import { Request, Response, NextFunction } from 'express';
import { historyService } from './history.service';
import { ApiResponse } from '../../shared/utils/response.util';
import { AuthenticatedRequest } from '../../shared/middleware/auth.middleware';

function parsePagination(query: Record<string, unknown>): { page: number; limit: number } {
  const page = Math.max(1, parseInt(String(query['page'] ?? '1'), 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(String(query['limit'] ?? '20'), 10) || 20));
  return { page, limit };
}

export const historyController = {
  async listOwn(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { userId } = req as AuthenticatedRequest;
      const { page, limit } = parsePagination(req.query as Record<string, unknown>);

      const result = await historyService.listForUser(userId, page, limit);
      res.json(ApiResponse.success(result));
    } catch (err) {
      next(err);
    }
  },

  async getDetails(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { userId, userRole } = req as AuthenticatedRequest;
      const { id } = req.params as { id: string };

      const analysis = await historyService.getById(id, userId, userRole === 'admin');

      if (!analysis) {
        res.status(404).json(ApiResponse.error('Analysis not found', 404));
        return;
      }

      res.json(ApiResponse.success(analysis));
    } catch (err) {
      next(err);
    }
  },

  async listAll(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { page, limit } = parsePagination(req.query as Record<string, unknown>);
      const filterUserId = req.query['userId'] ? String(req.query['userId']) : undefined;

      const result = await historyService.listAll(page, limit, filterUserId);
      res.json(ApiResponse.success(result));
    } catch (err) {
      next(err);
    }
  },
};
