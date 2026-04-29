/**
 * Document Analysis Routes
 *
 * POST   /api/v1/document-analysis/generate-patches
 * POST   /api/v1/document-analysis/correct/:documentId
 * GET    /api/v1/document-analysis/:documentId/issues
 * GET    /api/v1/document-analysis/:documentId/download?issueIds=id1,id2
 */

import { Router } from 'express';
import { documentAnalysisController } from './document-analysis.controller';
import { authMiddleware } from '../../shared/middleware/auth.middleware';

export const documentAnalysisRouter = Router();

documentAnalysisRouter.use(authMiddleware);

documentAnalysisRouter.post('/generate-patches', documentAnalysisController.generatePatches);

documentAnalysisRouter.post('/correct/:documentId', documentAnalysisController.correct);

documentAnalysisRouter.get('/:documentId/download', documentAnalysisController.download);

documentAnalysisRouter.get('/:documentId/issues', documentAnalysisController.getIssues);
