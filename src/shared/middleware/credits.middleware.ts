/**
 * Credits Middleware
 *
 * requireCredits  — Atomically deducts 1 credit before the AI analysis.
 *                   Attaches `creditDeducted: true` to req so the controller
 *                   can restore on failure.
 *
 * requireQuestion — Checks and atomically increments questionsUsed for a contract.
 *                   Requires `documentId` on req body or query.
 *
 * requireAutoFix  — Checks and atomically increments autoFixUsed for a contract.
 *                   Requires `documentId` on req body or params.
 */

import { Request, Response, NextFunction } from 'express';
import { billingService } from '../../modules/billing/billing.service';
import { ApiResponse } from '../utils/response.util';
import { AuthenticatedRequest } from './auth.middleware';

/** Extended request carrying credit deduction state */
export interface BillingAwareRequest extends AuthenticatedRequest {
  creditDeducted: boolean;
}

// ── requireCredits ───────────────────────────────────────────────────────────

/**
 * Middleware that must run AFTER authMiddleware.
 * Deducts 1 credit atomically. If user has 0 credits, returns 402.
 * The controller MUST call billingService.restoreCredit() in its catch block.
 */
export async function requireCredits(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const { userId } = req as AuthenticatedRequest;

  const result = await billingService
    .deductCredit(userId, 'Analysis pre-deduction')
    .catch(() => null);

  if (!result || !result.success) {
    res
      .status(402)
      .json(
        ApiResponse.error(
          'Você não possui créditos suficientes. Faça upgrade do seu plano para continuar.',
          402,
        ),
      );
    return;
  }

  (req as BillingAwareRequest).creditDeducted = true;
  next();
}

// ── requireQuestion ──────────────────────────────────────────────────────────

/**
 * Checks and consumes the question limit for a specific contract.
 * Expects req.body.documentId (or req.query.documentId) to identify the contract.
 * If documentId is absent, falls back to per-user tracking without per-contract limits.
 */
export async function requireQuestion(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const { userId } = req as AuthenticatedRequest;

  const documentId =
    ((req.body as Record<string, unknown>)?.documentId as string | undefined) ??
    (req.query.documentId as string | undefined);

  // No documentId → can't enforce per-contract limits → allow (backward compat)
  if (!documentId) {
    next();
    return;
  }

  const result = await billingService.consumeQuestion(userId, documentId).catch(() => null);

  if (!result || !result.allowed) {
    const status = await billingService.getUserBillingStatus(userId);
    res
      .status(402)
      .json(
        ApiResponse.error(
          `Você atingiu o limite de ${status.questionLimitPerContract} pergunta(s) para este contrato. Faça upgrade do seu plano para mais perguntas.`,
          402,
        ),
      );
    return;
  }

  next();
}

// ── requireAutoFix ───────────────────────────────────────────────────────────

/**
 * Checks and consumes the auto-fix limit for a specific contract.
 * Expects req.body.documentId or req.params.documentId.
 */
export async function requireAutoFix(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const { userId } = req as AuthenticatedRequest;

  const documentId =
    req.params.documentId ??
    ((req.body as Record<string, unknown>)?.documentId as string | undefined);

  if (!documentId) {
    throw Object.assign(new Error('documentId is required for auto-fix'), { statusCode: 400 });
  }

  const result = await billingService.consumeAutoFix(userId, documentId).catch(() => null);

  if (!result || !result.allowed) {
    const status = await billingService.getUserBillingStatus(userId);

    const message =
      status.autoFixLimitPerContract === 0
        ? 'Correção automática não está disponível no seu plano atual. Faça upgrade para o Plano Essencial ou Mensal.'
        : `Você já utilizou a correção automática para este contrato. Faça upgrade do seu plano para mais correções.`;

    res.status(402).json(ApiResponse.error(message, 402));
    return;
  }

  next();
}
