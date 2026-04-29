/**
 * History Service
 *
 * Encapsulates all database queries for the analysis history.
 * Controllers remain thin — they only parse HTTP input and call this service.
 */

import { Types } from 'mongoose';
import { AnalysisModel } from './analysis.model';

export interface HistoryPage {
  items: unknown[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export class HistoryService {
  /**
   * List analyses for a single user (paginated, newest first).
   */
  async listForUser(userId: string, page: number, limit: number): Promise<HistoryPage> {
    const filter = { userId: new Types.ObjectId(userId) };
    const [items, total] = await Promise.all([
      AnalysisModel.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .select('-analysis -rawResponse') // lightweight list
        .lean(),
      AnalysisModel.countDocuments(filter),
    ]);

    return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  /**
   * List all analyses across all users (admin only, paginated, newest first).
   * Optionally filter by a specific userId.
   */
  async listAll(page: number, limit: number, filterUserId?: string): Promise<HistoryPage> {
    const filter = filterUserId ? { userId: new Types.ObjectId(filterUserId) } : {};
    const [items, total] = await Promise.all([
      AnalysisModel.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .select('-analysis -rawResponse')
        .populate('userId', 'email role')
        .lean(),
      AnalysisModel.countDocuments(filter),
    ]);

    return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  /**
   * Get full details of a single analysis.
   * Returns null if not found or if the requesting user doesn't own it (and isn't admin).
   */
  async getById(
    analysisId: string,
    requestingUserId: string,
    isAdmin: boolean,
  ): Promise<unknown | null> {
    const analysis = await AnalysisModel.findById(analysisId)
      .populate('userId', 'email role')
      .lean();

    if (!analysis) return null;

    // Non-admins can only access their own analyses
    const ownerStr = (
      analysis as { userId: { toString(): string } | { _id: unknown } }
    ).userId?.toString();
    if (!isAdmin && ownerStr !== requestingUserId) return null;

    return analysis;
  }
}

export const historyService = new HistoryService();
