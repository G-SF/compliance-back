/**
 * AI Routes
 *
 * POST /generate              — prompt + optional context (JSON body)
 * POST /generate-with-files   — file(s) only + optional contractText (core/analyze, no user question)
 * POST /ask                   — file(s) + required question (freemium, no system pre-prompt)
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
aiRouter.post('/ask', upload.array('files'), aiController.askWithFile);
