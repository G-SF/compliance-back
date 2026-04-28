/**
 * AI Routes
 *
 * POST /generate              — prompt + optional context (JSON body)
 * POST /generate-with-files   — prompt + optional context + files[] (multipart/form-data)
 */

import { Router } from 'express';
import multer from 'multer';
import { aiController } from './ai.controller';

// Keep files in memory — we only need the text content, no disk I/O required
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB per file
});

export const aiRouter = Router();

aiRouter.post('/generate', aiController.generate);
aiRouter.post('/generate-with-files', upload.array('files'), aiController.generateWithFiles);
