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

// Keep files in memory — we only need the text content, no disk I/O required
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB por arquivo (PDFs podem ser maiores que TXTs)
});

export const aiRouter = Router();

// All AI routes require authentication
aiRouter.use(authMiddleware);

aiRouter.post('/generate-with-files', upload.array('files'), aiController.generateWithFiles);
aiRouter.post('/ask', upload.array('files'), aiController.askWithFile);
