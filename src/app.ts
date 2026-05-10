/**
 * Express Application Factory
 *
 * We use the factory pattern (createApp) so the app can be instantiated
 * multiple times independently — useful for integration tests.
 *
 * Choice: Express over NestJS
 *  - Lighter weight for this project scope
 *  - Full control over middleware ordering
 *  - NestJS-style layering is replicated manually (controllers, services, routes)
 *  - Easier to migrate to NestJS later if needed — same folder conventions
 */

import express, { Application, Request, Response } from 'express';
import cors from 'cors';
import { apiReference } from '@scalar/express-api-reference';
import { authRouter } from './modules/auth/auth.routes';
import { aiRouter } from './modules/ai/ai.routes';
import { historyRouter } from './modules/history/history.routes';
import { documentAnalysisRouter } from './modules/document-analysis/document-analysis.routes';
import { aiCostsRouter } from './modules/ai-costs/ai-costs.routes';
import { errorMiddleware } from './shared/middleware/error.middleware';
import { ApiResponse } from './shared/utils/response.util';
import { openApiSpec } from './config/openapi';

export function createApp(): Application {
  const app = express();

  // ── CORS ────────────────────────────────────────────────────────────────────
  app.use(
    cors({
      origin: process.env['CORS_ORIGIN'] ?? 'http://localhost:5173',
      credentials: true,
      exposedHeaders: ['Content-Disposition'],
    }),
  );

  // ── Built-in middleware ─────────────────────────────────────────────────────
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true }));

  // ── API Playground (Scalar) ─────────────────────────────────────────────────
  // Disponível em: GET /docs
  app.use(
    '/docs',
    apiReference({
      spec: { content: openApiSpec },
      theme: 'default',
    }),
  );

  // ── Health check ────────────────────────────────────────────────────────────
  // Intentionally placed before any auth so load-balancers can reach it freely
  app.get('/health', (_req: Request, res: Response) => {
    res.json(ApiResponse.success({ status: 'ok', timestamp: new Date().toISOString() }));
  });

  // ── Feature routes ──────────────────────────────────────────────────────────
  app.use('/api/v1/auth', authRouter);
  app.use('/api/v1/ai', aiRouter);
  app.use('/api/v1/history', historyRouter);
  app.use('/api/v1/document-analysis', documentAnalysisRouter);
  app.use('/api/v1/ai-costs', aiCostsRouter);

  // ── Catch-all 404 ───────────────────────────────────────────────────────────
  app.use((_req: Request, res: Response) => {
    res.status(404).json(ApiResponse.error('Route not found', 404));
  });

  // ── Centralised error handler (must be last) ────────────────────────────────
  app.use(errorMiddleware);

  return app;
}
