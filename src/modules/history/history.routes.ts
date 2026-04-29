/**
 * History Routes
 *
 * All routes require authentication (authMiddleware applied globally via prefix).
 * Admin routes additionally require requireRole('admin').
 */

import { Router } from 'express';
import { historyController } from './history.controller';
import { authMiddleware } from '../../shared/middleware/auth.middleware';
import { requireRole } from '../../shared/middleware/role.middleware';

export const historyRouter = Router();

// All history routes require a valid JWT
historyRouter.use(authMiddleware);

// Admin route — registered BEFORE /:id to prevent Express matching 'admin' as an id param
historyRouter.get('/admin/all', requireRole('admin'), historyController.listAll);

// User routes
historyRouter.get('/', historyController.listOwn);
historyRouter.get('/:id', historyController.getDetails);
