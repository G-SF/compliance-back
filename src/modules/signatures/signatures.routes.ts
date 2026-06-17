/**
 * Signatures Routes
 *
 * Mounted at /api/v1/signatures — all routes require authentication.
 */

import { Router } from 'express';
import multer from 'multer';
import { signaturesController } from './signatures.controller';
import { authMiddleware } from '../../shared/middleware/auth.middleware';
import { requireSignature } from '../../shared/middleware/credits.middleware';

// PDFs kept in memory — stored as Buffer in MongoDB, no disk I/O.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10 MB
    files: 1,
  },
});

export const signaturesRouter = Router();

signaturesRouter.use(authMiddleware);

signaturesRouter.post('/upload', upload.single('file'), signaturesController.upload);
signaturesRouter.get('/', signaturesController.list);
signaturesRouter.get('/:id', signaturesController.detail);
signaturesRouter.post('/:id/sign', requireSignature, signaturesController.sign);
signaturesRouter.get('/:id/history', signaturesController.history);
signaturesRouter.get('/:id/original', signaturesController.original);
signaturesRouter.get('/:id/download', signaturesController.download);
