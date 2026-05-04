/**
 * AI Costs Service
 *
 * Aggregates spend data from AnalysisModel to expose full cost visibility:
 *   - Per-request details (linked to the user who made the request)
 *   - Daily / weekly / monthly breakdowns
 *   - Overall summaries with per-model and per-type splits
 *   - Admin view: breakdown across all users or filtered by a specific user
 *
 * BRL conversion uses the USD_BRL_RATE config value (env var, default 5.90).
 * All monetary values are rounded to 6 decimal places for precision.
 */

import { Types, PipelineStage } from 'mongoose';
import { AnalysisModel } from '../history/analysis.model';
import { config } from '../../config';

// ─── Interfaces ──────────────────────────────────────────────────────────────

export interface CostSummary {
  period: { from: string | null; to: string | null };
  usdToBrlRate: number;
  requests: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  costUsd: number;
  costBrl: number;
  avgCostPerRequestUsd: number;
  avgCostPerRequestBrl: number;
  avgInputTokensPerRequest: number;
  avgOutputTokensPerRequest: number;
  byModel: ModelBreakdown[];
  byType: TypeBreakdown[];
}

export interface ModelBreakdown {
  model: string;
  requests: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  costUsd: number;
  costBrl: number;
}

export interface TypeBreakdown {
  type: string;
  requests: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  costUsd: number;
  costBrl: number;
}

export interface PeriodBreakdown {
  period: string; // YYYY-MM-DD | YYYY-WXX | YYYY-MM
  label: string; // human-friendly
  requests: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  costUsd: number;
  costBrl: number;
}

export interface RequestDetail {
  id: string;
  userId: string;
  userEmail?: string;
  analysisType: string;
  status: string;
  fileName: string | null;
  fileExtension: string | null;
  aiModel: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  costUsd: number;
  costBrl: number;
  createdAt: string;
}

export interface RequestsPage {
  items: RequestDetail[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  usdToBrlRate: number;
}

export interface UserCostRow {
  userId: string;
  email: string;
  requests: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  costUsd: number;
  costBrl: number;
  lastRequestAt: string | null;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function toBrl(usd: number): number {
  return parseFloat((usd * config.costs.usdToBrlRate).toFixed(6));
}

/**
 * Builds the $match stage filter for date range and optional userId restriction.
 */
function buildMatchFilter(opts: {
  userId?: string;
  from?: Date;
  to?: Date;
}): Record<string, unknown> {
  const filter: Record<string, unknown> = { status: 'completed' };

  if (opts.userId) {
    filter['userId'] = new Types.ObjectId(opts.userId);
  }

  if (opts.from || opts.to) {
    const dateFilter: Record<string, Date> = {};
    if (opts.from) dateFilter['$gte'] = opts.from;
    if (opts.to) dateFilter['$lte'] = opts.to;
    filter['createdAt'] = dateFilter;
  }

  return filter;
}

/**
 * Converts ISO week year+week to the Monday date string (YYYY-MM-DD).
 */
function isoWeekToMonday(year: number, week: number): string {
  // Jan 4 is always in ISO week 1
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const dayOfJan4 = jan4.getUTCDay() || 7; // convert 0 (Sun) → 7
  const monday = new Date(jan4);
  monday.setUTCDate(jan4.getUTCDate() - dayOfJan4 + 1 + (week - 1) * 7);
  return monday.toISOString().slice(0, 10);
}

function isoWeekToSunday(year: number, week: number): string {
  const monday = new Date(isoWeekToMonday(year, week) + 'T00:00:00Z');
  monday.setUTCDate(monday.getUTCDate() + 6);
  return monday.toISOString().slice(0, 10);
}

// ─── Service ─────────────────────────────────────────────────────────────────

export class AiCostsService {
  // ── Summary ────────────────────────────────────────────────────────────────

  async getSummary(opts: { userId?: string; from?: Date; to?: Date }): Promise<CostSummary> {
    const matchFilter = buildMatchFilter(opts);

    const [result] = await AnalysisModel.aggregate([
      { $match: matchFilter },
      {
        $facet: {
          totals: [
            {
              $group: {
                _id: null,
                requests: { $sum: 1 },
                inputTokens: { $sum: '$inputTokens' },
                outputTokens: { $sum: '$outputTokens' },
                costUsd: { $sum: '$costUsd' },
              },
            },
          ],
          byModel: [
            {
              $group: {
                _id: '$aiModel',
                requests: { $sum: 1 },
                inputTokens: { $sum: '$inputTokens' },
                outputTokens: { $sum: '$outputTokens' },
                costUsd: { $sum: '$costUsd' },
              },
            },
            { $sort: { costUsd: -1 } },
          ],
          byType: [
            {
              $group: {
                _id: '$analysisType',
                requests: { $sum: 1 },
                inputTokens: { $sum: '$inputTokens' },
                outputTokens: { $sum: '$outputTokens' },
                costUsd: { $sum: '$costUsd' },
              },
            },
            { $sort: { costUsd: -1 } },
          ],
        },
      },
    ]);

    const totals = result?.totals?.[0] ?? {
      requests: 0,
      inputTokens: 0,
      outputTokens: 0,
      costUsd: 0,
    };

    const requests: number = totals.requests ?? 0;
    const inputTokens: number = totals.inputTokens ?? 0;
    const outputTokens: number = totals.outputTokens ?? 0;
    const totalTokens = inputTokens + outputTokens;
    const costUsd: number = parseFloat((totals.costUsd ?? 0).toFixed(6));
    const costBrl = toBrl(costUsd);

    const byModel: ModelBreakdown[] = (result?.byModel ?? []).map(
      (m: {
        _id: string;
        requests: number;
        inputTokens: number;
        outputTokens: number;
        costUsd: number;
      }) => ({
        model: m._id,
        requests: m.requests,
        inputTokens: m.inputTokens,
        outputTokens: m.outputTokens,
        totalTokens: m.inputTokens + m.outputTokens,
        costUsd: parseFloat(m.costUsd.toFixed(6)),
        costBrl: toBrl(m.costUsd),
      }),
    );

    const byType: TypeBreakdown[] = (result?.byType ?? []).map(
      (t: {
        _id: string;
        requests: number;
        inputTokens: number;
        outputTokens: number;
        costUsd: number;
      }) => ({
        type: t._id,
        requests: t.requests,
        inputTokens: t.inputTokens,
        outputTokens: t.outputTokens,
        totalTokens: t.inputTokens + t.outputTokens,
        costUsd: parseFloat(t.costUsd.toFixed(6)),
        costBrl: toBrl(t.costUsd),
      }),
    );

    return {
      period: {
        from: opts.from?.toISOString() ?? null,
        to: opts.to?.toISOString() ?? null,
      },
      usdToBrlRate: config.costs.usdToBrlRate,
      requests,
      inputTokens,
      outputTokens,
      totalTokens,
      costUsd,
      costBrl,
      avgCostPerRequestUsd: requests > 0 ? parseFloat((costUsd / requests).toFixed(6)) : 0,
      avgCostPerRequestBrl: requests > 0 ? parseFloat((costBrl / requests).toFixed(4)) : 0,
      avgInputTokensPerRequest: requests > 0 ? Math.round(inputTokens / requests) : 0,
      avgOutputTokensPerRequest: requests > 0 ? Math.round(outputTokens / requests) : 0,
      byModel,
      byType,
    };
  }

  // ── Per-request list (user) ─────────────────────────────────────────────────

  async getRequests(opts: {
    userId: string;
    page: number;
    limit: number;
    from?: Date;
    to?: Date;
  }): Promise<RequestsPage> {
    return this._getRequestsInternal({ ...opts, adminMode: false });
  }

  // ── Per-request list (admin) ────────────────────────────────────────────────

  async getAllRequests(opts: {
    page: number;
    limit: number;
    from?: Date;
    to?: Date;
    filterUserId?: string;
  }): Promise<RequestsPage> {
    return this._getRequestsInternal({
      userId: opts.filterUserId,
      page: opts.page,
      limit: opts.limit,
      from: opts.from,
      to: opts.to,
      adminMode: true,
    });
  }

  private async _getRequestsInternal(opts: {
    userId?: string;
    page: number;
    limit: number;
    from?: Date;
    to?: Date;
    adminMode: boolean;
  }): Promise<RequestsPage> {
    const matchFilter = buildMatchFilter({ userId: opts.userId, from: opts.from, to: opts.to });
    const skip = (opts.page - 1) * opts.limit;

    // Run items query and count in parallel to avoid $facet type conflicts
    const itemsPipeline: PipelineStage[] = [
      { $match: matchFilter },
      { $sort: { createdAt: -1 } as Record<string, 1 | -1> },
      { $skip: skip },
      { $limit: opts.limit },
    ];

    if (opts.adminMode) {
      itemsPipeline.push(
        {
          $lookup: {
            from: 'users',
            localField: 'userId',
            foreignField: '_id',
            as: 'user',
          },
        },
        {
          $unwind: {
            path: '$user',
            preserveNullAndEmptyArrays: true,
          },
        },
      );
    }

    itemsPipeline.push({
      $project: {
        _id: 1,
        userId: 1,
        ...(opts.adminMode ? { userEmail: '$user.email' } : {}),
        analysisType: 1,
        status: 1,
        fileName: 1,
        fileExtension: 1,
        aiModel: 1,
        inputTokens: 1,
        outputTokens: 1,
        costUsd: 1,
        createdAt: 1,
      },
    });

    const [rawItems, total] = await Promise.all([
      AnalysisModel.aggregate(itemsPipeline),
      AnalysisModel.countDocuments(matchFilter),
    ]);

    const typedItems: Array<{
      _id: Types.ObjectId;
      userId: Types.ObjectId;
      userEmail?: string;
      analysisType: string;
      status: string;
      fileName: string | null;
      fileExtension: string | null;
      aiModel: string;
      inputTokens: number;
      outputTokens: number;
      costUsd: number;
      createdAt: Date;
    }> = rawItems;

    const items: RequestDetail[] = typedItems.map(item => ({
      id: item._id.toString(),
      userId: item.userId.toString(),
      ...(opts.adminMode && item.userEmail ? { userEmail: item.userEmail } : {}),
      analysisType: item.analysisType,
      status: item.status,
      fileName: item.fileName ?? null,
      fileExtension: item.fileExtension ?? null,
      aiModel: item.aiModel,
      inputTokens: item.inputTokens,
      outputTokens: item.outputTokens,
      totalTokens: item.inputTokens + item.outputTokens,
      costUsd: parseFloat(item.costUsd.toFixed(6)),
      costBrl: toBrl(item.costUsd),
      createdAt: item.createdAt.toISOString(),
    }));

    return {
      items,
      total,
      page: opts.page,
      limit: opts.limit,
      totalPages: Math.ceil(total / opts.limit),
      usdToBrlRate: config.costs.usdToBrlRate,
    };
  }

  // ── Daily breakdown ─────────────────────────────────────────────────────────

  async getDailyBreakdown(opts: {
    userId?: string;
    from?: Date;
    to?: Date;
    timezone?: string;
  }): Promise<PeriodBreakdown[]> {
    const matchFilter = buildMatchFilter(opts);
    const tz = opts.timezone ?? 'America/Sao_Paulo';

    const results: Array<{
      _id: string;
      requests: number;
      inputTokens: number;
      outputTokens: number;
      costUsd: number;
    }> = await AnalysisModel.aggregate([
      { $match: matchFilter },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: tz } },
          requests: { $sum: 1 },
          inputTokens: { $sum: '$inputTokens' },
          outputTokens: { $sum: '$outputTokens' },
          costUsd: { $sum: '$costUsd' },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    return results.map(r => ({
      period: r._id,
      label: r._id, // YYYY-MM-DD
      requests: r.requests,
      inputTokens: r.inputTokens,
      outputTokens: r.outputTokens,
      totalTokens: r.inputTokens + r.outputTokens,
      costUsd: parseFloat(r.costUsd.toFixed(6)),
      costBrl: toBrl(r.costUsd),
    }));
  }

  // ── Weekly breakdown ────────────────────────────────────────────────────────

  async getWeeklyBreakdown(opts: {
    userId?: string;
    from?: Date;
    to?: Date;
  }): Promise<PeriodBreakdown[]> {
    const matchFilter = buildMatchFilter(opts);

    const results: Array<{
      _id: { year: number; week: number };
      requests: number;
      inputTokens: number;
      outputTokens: number;
      costUsd: number;
    }> = await AnalysisModel.aggregate([
      { $match: matchFilter },
      {
        $group: {
          _id: {
            year: { $isoWeekYear: '$createdAt' },
            week: { $isoWeek: '$createdAt' },
          },
          requests: { $sum: 1 },
          inputTokens: { $sum: '$inputTokens' },
          outputTokens: { $sum: '$outputTokens' },
          costUsd: { $sum: '$costUsd' },
        },
      },
      { $sort: { '_id.year': 1, '_id.week': 1 } },
    ]);

    return results.map(r => {
      const weekStart = isoWeekToMonday(r._id.year, r._id.week);
      const weekEnd = isoWeekToSunday(r._id.year, r._id.week);
      const weekLabel = `W${String(r._id.week).padStart(2, '0')}/${r._id.year}`;
      return {
        period: `${r._id.year}-W${String(r._id.week).padStart(2, '0')}`,
        label: `${weekLabel} (${weekStart} → ${weekEnd})`,
        requests: r.requests,
        inputTokens: r.inputTokens,
        outputTokens: r.outputTokens,
        totalTokens: r.inputTokens + r.outputTokens,
        costUsd: parseFloat(r.costUsd.toFixed(6)),
        costBrl: toBrl(r.costUsd),
      };
    });
  }

  // ── Monthly breakdown ───────────────────────────────────────────────────────

  async getMonthlyBreakdown(opts: {
    userId?: string;
    from?: Date;
    to?: Date;
    timezone?: string;
  }): Promise<PeriodBreakdown[]> {
    const matchFilter = buildMatchFilter(opts);
    const tz = opts.timezone ?? 'America/Sao_Paulo';

    const results: Array<{
      _id: string;
      requests: number;
      inputTokens: number;
      outputTokens: number;
      costUsd: number;
    }> = await AnalysisModel.aggregate([
      { $match: matchFilter },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m', date: '$createdAt', timezone: tz } },
          requests: { $sum: 1 },
          inputTokens: { $sum: '$inputTokens' },
          outputTokens: { $sum: '$outputTokens' },
          costUsd: { $sum: '$costUsd' },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    const monthNames = [
      'Jan',
      'Fev',
      'Mar',
      'Abr',
      'Mai',
      'Jun',
      'Jul',
      'Ago',
      'Set',
      'Out',
      'Nov',
      'Dez',
    ];

    return results.map(r => {
      const [year, month] = r._id.split('-');
      const monthIdx = parseInt(month, 10) - 1;
      return {
        period: r._id,
        label: `${monthNames[monthIdx]}/${year}`,
        requests: r.requests,
        inputTokens: r.inputTokens,
        outputTokens: r.outputTokens,
        totalTokens: r.inputTokens + r.outputTokens,
        costUsd: parseFloat(r.costUsd.toFixed(6)),
        costBrl: toBrl(r.costUsd),
      };
    });
  }

  // ── By-user breakdown (admin only) ─────────────────────────────────────────

  async getByUserBreakdown(opts: { from?: Date; to?: Date }): Promise<UserCostRow[]> {
    const matchFilter = buildMatchFilter(opts);

    const results: Array<{
      _id: Types.ObjectId;
      email: string;
      requests: number;
      inputTokens: number;
      outputTokens: number;
      costUsd: number;
      lastRequestAt: Date;
    }> = await AnalysisModel.aggregate([
      { $match: matchFilter },
      {
        $group: {
          _id: '$userId',
          requests: { $sum: 1 },
          inputTokens: { $sum: '$inputTokens' },
          outputTokens: { $sum: '$outputTokens' },
          costUsd: { $sum: '$costUsd' },
          lastRequestAt: { $max: '$createdAt' },
        },
      },
      {
        $lookup: {
          from: 'users',
          localField: '_id',
          foreignField: '_id',
          as: 'user',
        },
      },
      { $unwind: { path: '$user', preserveNullAndEmptyArrays: true } },
      {
        $project: {
          _id: 1,
          email: { $ifNull: ['$user.email', 'unknown'] },
          requests: 1,
          inputTokens: 1,
          outputTokens: 1,
          costUsd: 1,
          lastRequestAt: 1,
        },
      },
      { $sort: { costUsd: -1 } },
    ]);

    return results.map(r => ({
      userId: r._id.toString(),
      email: r.email,
      requests: r.requests,
      inputTokens: r.inputTokens,
      outputTokens: r.outputTokens,
      totalTokens: r.inputTokens + r.outputTokens,
      costUsd: parseFloat(r.costUsd.toFixed(6)),
      costBrl: toBrl(r.costUsd),
      lastRequestAt: r.lastRequestAt?.toISOString() ?? null,
    }));
  }
}

export const aiCostsService = new AiCostsService();
