/**
 * AI Routes
 *
 * POST /generate-with-files   — file(s) only + optional contractText (full structured analysis)
 * POST /ask                   — file(s) + required question (Markdown answer, no JSON)
 */

import { Router } from 'express';
import multer from 'multer';
import { aiController } from './ai.controller';
import { authMiddleware } from '../../shared/middleware/auth.middleware';
import { requireCredits, requireQuestion } from '../../shared/middleware/credits.middleware';

// Keep files in memory — we only need the text content, no disk I/O required
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10 MB per file
    files: 5,                    // max 5 files per request
  },
});

export const aiRouter = Router();

// All AI routes require authentication
aiRouter.use(authMiddleware);

// generate-with-files consumes 1 credit per call
aiRouter.post(
  '/generate-with-files',
  requireCredits,
  upload.array('files'),
  aiController.generateWithFiles,
);

// /ask: question-limit check (documentId optional in body for per-contract tracking)
aiRouter.post('/ask', requireQuestion, upload.array('files'), aiController.askWithFile);
