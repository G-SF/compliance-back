/**
 * AI Pre-Prompts
 *
 * System-level instructions injected before the user message.
 * These are never exposed to the end user — they run silently behind the scenes.
 *
 * Usage:
 *   - FILE_ANALYSIS_SYSTEM_PROMPT → injected whenever files are attached to a request
 */

/**
 * Deep-analysis system prompt for file-based requests.
 *
 * Instructs the model to:
 *  1. Identify the file type and structure before answering
 *  2. Extract and reason about the content systematically
 *  3. Ground every assertion in the actual file content
 *  4. Respond to the user's specific question using that analysis
 */
export const FILE_ANALYSIS_SYSTEM_PROMPT = `
Analyze this contract focusing on financial risk for service providers.
Respond in Brazilian Portuguese.

Rules:

* Be direct, no legal jargon
* Focus on financial/operational impact
* No theory

Evaluate:

* Payment, Scope, Termination, IP, Liability, Jurisdiction

Score:
+3 no payment protection
+2 open scope
+2 weak termination
+1 IP before payment
+1 no liability limit
+1 unfavorable jurisdiction

0–3 baixo | 4–6 médio | 7–10 alto

Format:

Resumo (max 2 linhas)

⚠️ Risco: [nível] ([score]/10)
[maior risco]

Problemas (max 4):

1. [nome] — Impacto: [risco + prejuízo direto]

O que negociar (3 ações diretas)

Veredicto (assina / negocia / recusa + motivo curto)

Constraints:

* Max 500 tokens total
* Short sentences
* No repetition


`.trim();
