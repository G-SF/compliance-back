/**
 * Signatures Controller
 *
 * POST   /api/v1/signatures/upload        — upload a PDF (multipart, field "file")
 * GET    /api/v1/signatures               — list the user's documents
 * GET    /api/v1/signatures/:id           — document detail
 * POST   /api/v1/signatures/:id/sign      — apply a drawn signature
 * GET    /api/v1/signatures/:id/history   — signature evidence history
 * GET    /api/v1/signatures/:id/download  — download the signed PDF
 */

import { Request, Response, NextFunction } from 'express';
import { signaturesService } from './signatures.service';
import { signDocumentSchema } from './signatures.dto';
import { ApiResponse } from '../../shared/utils/response.util';
import { AuthenticatedRequest } from '../../shared/middleware/auth.middleware';
import { SignatureAwareRequest } from '../../shared/middleware/credits.middleware';
import { billingService } from '../billing/billing.service';

/** Extracts the client IP, honouring a reverse-proxy X-Forwarded-For header. */
function clientIp(req: Request): string | null {
  const xff = req.headers['x-forwarded-for'];
  if (typeof xff === 'string' && xff.length > 0) {
    return xff.split(',')[0].trim();
  }
  return req.ip ?? null;
}

export const signaturesController = {
  /** POST /upload */
  async upload(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { userId } = req as AuthenticatedRequest;
      const file = req.file;

      if (!file) {
        throw Object.assign(new Error('Envie um arquivo PDF no campo "file".'), {
          statusCode: 400,
        });
      }

      const fileName = Buffer.from(file.originalname, 'latin1').toString('utf8');
      const doc = await signaturesService.createDocument(userId, fileName, file.buffer);

      res.status(201).json(ApiResponse.success(doc, 'Documento enviado com sucesso'));
    } catch (err) {
      next(err);
    }
  },

  /** GET / */
  async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { userId } = req as AuthenticatedRequest;
      const docs = await signaturesService.listDocuments(userId);
      res.json(ApiResponse.success(docs));
    } catch (err) {
      next(err);
    }
  },

  /** GET /:id */
  async detail(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { userId } = req as AuthenticatedRequest;
      const doc = await signaturesService.getDocument(userId, req.params.id);
      res.json(ApiResponse.success(doc));
    } catch (err) {
      next(err);
    }
  },

  /** POST /:id/sign — runs after requireSignature (which consumed 1 from the plan). */
  async sign(req: Request, res: Response, next: NextFunction): Promise<void> {
    const { userId } = req as AuthenticatedRequest;
    try {
      const parsed = signDocumentSchema.safeParse(req.body);
      if (!parsed.success) {
        throw Object.assign(new Error(parsed.error.issues.map(e => e.message).join('; ')), {
          statusCode: 400,
        });
      }

      const { document, signature } = await signaturesService.signDocument(
        userId,
        req.params.id,
        parsed.data.signatureImage,
        { ipAddress: clientIp(req), userAgent: req.headers['user-agent'] ?? null },
      );

      res.json(
        ApiResponse.success(
          {
            document,
            signature: {
              id: signature._id,
              email: signature.email,
              pdfHash: signature.pdfHash,
              signedAt: signature.signedAt,
            },
          },
          'Documento assinado com sucesso',
        ),
      );
    } catch (err) {
      // The signature allowance was consumed by the middleware — restore it so
      // the user is not charged for a signature that failed to complete.
      if ((req as SignatureAwareRequest).signatureConsumed) {
        await billingService
          .restoreSignature(userId, 'Signature failed — allowance restored')
          .catch(() => undefined);
      }
      next(err);
    }
  },

  /** GET /:id/history */
  async history(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { userId } = req as AuthenticatedRequest;
      const signatures = await signaturesService.getHistory(userId, req.params.id);
      res.json(ApiResponse.success(signatures));
    } catch (err) {
      next(err);
    }
  },

  /** GET /:id/original — serves the original PDF inline (used by the signing-screen preview). */
  async original(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { userId } = req as AuthenticatedRequest;
      const { buffer, fileName } = await signaturesService.getOriginalPdf(userId, req.params.id);

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="${fileName}"`);
      res.send(buffer);
    } catch (err) {
      next(err);
    }
  },

  /** GET /:id/download */
  async download(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { userId } = req as AuthenticatedRequest;
      const { buffer, fileName } = await signaturesService.getSignedPdf(userId, req.params.id);

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
      res.send(buffer);
    } catch (err) {
      next(err);
    }
  },
};
