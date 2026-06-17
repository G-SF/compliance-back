/**
 * Signatures DTOs / validation
 */

import { z } from 'zod';

export const signDocumentSchema = z.object({
  /** Hand-drawn signature as a Base64 PNG data URL (or raw base64). */
  signatureImage: z
    .string()
    .trim()
    .min(1, 'A imagem da assinatura é obrigatória')
    .refine(
      v => v.startsWith('data:image/png') || /^[A-Za-z0-9+/=]+$/.test(v),
      'A assinatura deve ser um PNG em Base64',
    ),
});

export type SignDocumentDto = z.infer<typeof signDocumentSchema>;
