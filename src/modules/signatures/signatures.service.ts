/**
 * Signatures Service
 *
 * Core business logic for the electronic-signature module:
 *  - Upload of a PDF (stored as Buffer in MongoDB)
 *  - Applying a hand-drawn signature → builds the final PDF + SHA-256 hash
 *  - Listing documents, signature history, and serving the signed PDF
 *
 * Plan-limit enforcement lives in the `requireSignature` middleware; this
 * service performs the action itself.
 */

import crypto from 'crypto';
import { Types } from 'mongoose';
import { UserModel } from '../auth/models/user.model';
import { SignedDocumentModel, ISignedDocument } from './models/signed-document.model';
import { SignatureModel, ISignature } from './models/signature.model';
import { buildSignedPdf, isPdfBuffer } from './signatures.pdf';

export interface SignEvidence {
  ipAddress: string | null;
  userAgent: string | null;
}

function notFound(): Error & { statusCode: number } {
  return Object.assign(new Error('Documento não encontrado'), { statusCode: 404 });
}

export const signaturesService = {
  /** Creates a pending document from an uploaded PDF. */
  async createDocument(userId: string, fileName: string, buffer: Buffer): Promise<ISignedDocument> {
    if (!isPdfBuffer(buffer)) {
      throw Object.assign(new Error('O arquivo enviado não é um PDF válido.'), {
        statusCode: 400,
      });
    }

    return SignedDocumentModel.create({
      userId: new Types.ObjectId(userId),
      fileName,
      status: 'pending',
      originalFileBuffer: buffer,
    });
  },

  /** Lists the user's documents (without the raw PDF bytes). */
  async listDocuments(userId: string): Promise<ISignedDocument[]> {
    return SignedDocumentModel.find({ userId: new Types.ObjectId(userId) })
      .sort({ createdAt: -1 })
      .select('-originalFileBuffer -signedFileBuffer');
  },

  /** Returns a single document the user owns (without raw PDF bytes). */
  async getDocument(userId: string, documentId: string): Promise<ISignedDocument> {
    const doc = await SignedDocumentModel.findOne({
      _id: documentId,
      userId: new Types.ObjectId(userId),
    }).select('-originalFileBuffer -signedFileBuffer');
    if (!doc) throw notFound();
    return doc;
  },

  /**
   * Applies the signature: builds the final PDF, computes the SHA-256 of the
   * original document, persists the evidence record, and flips the document to
   * `signed`. Returns the updated document and the evidence entry.
   */
  async signDocument(
    userId: string,
    documentId: string,
    signatureImage: string,
    evidence: SignEvidence,
  ): Promise<{ document: ISignedDocument; signature: ISignature }> {
    const doc = await SignedDocumentModel.findOne({
      _id: documentId,
      userId: new Types.ObjectId(userId),
    });
    if (!doc) throw notFound();

    if (doc.status === 'signed') {
      throw Object.assign(new Error('Este documento já foi assinado.'), { statusCode: 409 });
    }

    const user = await UserModel.findById(userId).select('email name');
    if (!user) throw Object.assign(new Error('Usuário não encontrado'), { statusCode: 404 });

    const originalBuffer = Buffer.isBuffer(doc.originalFileBuffer)
      ? doc.originalFileBuffer
      : Buffer.from(doc.originalFileBuffer as unknown as Uint8Array);

    // Integrity: SHA-256 of the original PDF being signed
    const pdfHash = crypto.createHash('sha256').update(originalBuffer).digest('hex');
    const signedAt = new Date();

    const signedBuffer = await buildSignedPdf({
      originalPdf: originalBuffer,
      signaturePngBase64: signatureImage,
      name: user.name ?? user.email,
      email: user.email,
      pdfHash,
      signedAt,
    });

    doc.signedFileBuffer = signedBuffer;
    doc.pdfHash = pdfHash;
    doc.status = 'signed';
    doc.signedAt = signedAt;
    await doc.save();

    const signature = await SignatureModel.create({
      documentId: doc._id,
      userId: new Types.ObjectId(userId),
      email: user.email,
      signatureImage,
      ipAddress: evidence.ipAddress,
      userAgent: evidence.userAgent,
      pdfHash,
      signedAt,
    });

    return { document: doc, signature };
  },

  /** Returns the signature evidence history for a document the user owns. */
  async getHistory(userId: string, documentId: string): Promise<ISignature[]> {
    const doc = await SignedDocumentModel.findOne({
      _id: documentId,
      userId: new Types.ObjectId(userId),
    }).select('_id');
    if (!doc) throw notFound();

    return SignatureModel.find({ documentId: doc._id }).sort({ signedAt: -1 });
  },

  /** Returns the original PDF bytes + filename (for the signing-screen preview). */
  async getOriginalPdf(
    userId: string,
    documentId: string,
  ): Promise<{ buffer: Buffer; fileName: string }> {
    const doc = await SignedDocumentModel.findOne({
      _id: documentId,
      userId: new Types.ObjectId(userId),
    });
    if (!doc) throw notFound();

    const buffer = Buffer.isBuffer(doc.originalFileBuffer)
      ? doc.originalFileBuffer
      : Buffer.from(doc.originalFileBuffer as unknown as Uint8Array);

    return { buffer, fileName: doc.fileName };
  },

  /** Returns the signed PDF bytes + filename for download. */
  async getSignedPdf(
    userId: string,
    documentId: string,
  ): Promise<{ buffer: Buffer; fileName: string }> {
    const doc = await SignedDocumentModel.findOne({
      _id: documentId,
      userId: new Types.ObjectId(userId),
    });
    if (!doc) throw notFound();

    if (doc.status !== 'signed' || !doc.signedFileBuffer) {
      throw Object.assign(new Error('Este documento ainda não foi assinado.'), {
        statusCode: 400,
      });
    }

    const buffer = Buffer.isBuffer(doc.signedFileBuffer)
      ? doc.signedFileBuffer
      : Buffer.from(doc.signedFileBuffer as unknown as Uint8Array);

    const base = doc.fileName
      .replace(/\.[^.]+$/, '')
      .replace(/[^\w\s.-]/g, '_')
      .slice(0, 100);
    return { buffer, fileName: `${base}-assinado.pdf` };
  },
};
