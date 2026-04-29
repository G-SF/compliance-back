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
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB por arquivo (PDFs podem ser maiores que TXTs)
});

export const aiRouter = Router();

aiRouter.post('/generate', aiController.generate);
aiRouter.post('/generate-with-files', upload.array('files'), aiController.generateWithFiles);
