/**
 * AI Service — Anthropic Claude Implementation
 *
 * Sends prompts to the Claude API using the official Anthropic SDK.
 * Handles structured errors and exposes usage metrics per request.
 *
 * Configuration (via environment variables / config):
 *   ANTHROPIC_API_KEY — required
 *   CLAUDE_MODEL      — defaults to "claude-haiku-4-5"
 *   CLAUDE_MAX_TOKENS — defaults to 1200 (fits the contract analysis format)
 */

import Anthropic from '@anthropic-ai/sdk';
import { IAiService, AiPromptOptions, AiResponse } from './ai.interface';
import { config } from '../../config';
import { logger } from '../../shared/utils/logger';

// Claude Haiku 4.5 pricing (USD per token)
const PRICE_INPUT_PER_TOKEN = 0.8 / 1_000_000;
const PRICE_OUTPUT_PER_TOKEN = 4.0 / 1_000_000;

// max_tokens: 1050 cobre o formato completo com até 7 problemas detalhados (~950 tokens)
// Claude para naturalmente quando termina — o cap só evita edge cases extremos
const MAX_OUTPUT_TOKENS_OVERRIDE = 600;

class ClaudeAiService implements IAiService {
  private readonly client: Anthropic;
  private readonly model: string;

  constructor() {
    // The SDK picks up ANTHROPIC_API_KEY from env automatically,
    // but we pass it explicitly for clarity and testability.
    this.client = new Anthropic({ apiKey: config.claude.apiKey });
    this.model = config.claude.model;
  }

  async complete(options: AiPromptOptions): Promise<AiResponse> {
    const { prompt, systemPrompt } = options;
    const startTime = Date.now();

    try {
      logger.info('[AI] Sending request to Claude', { model: this.model });

      const msg = await this.client.messages.create({
        model: this.model,
        max_tokens: Math.min(config.claude.maxTokens, MAX_OUTPUT_TOKENS_OVERRIDE),
        // temperature: 0 = respostas determinísticas e consistentes
        // Ideal para análise factual — elimina variação entre chamadas
        // Não usar top_p junto com temperature (Anthropic recomenda um ou outro)
        temperature: 0,
        ...(systemPrompt ? { system: systemPrompt } : {}),
        messages: [{ role: 'user', content: prompt }],
      });

      const latencyMs = Date.now() - startTime;
      const text = msg.content
        .filter((block): block is Anthropic.TextBlock => block.type === 'text')
        .map(block => block.text)
        .join('');
      const inputTokens = msg.usage.input_tokens;
      const outputTokens = msg.usage.output_tokens;
      const tokensUsed = inputTokens + outputTokens;
      const costUsd = inputTokens * PRICE_INPUT_PER_TOKEN + outputTokens * PRICE_OUTPUT_PER_TOKEN;

      logger.info('[AI] Response received', {
        latencyMs,
        model: msg.model,
        inputTokens,
        outputTokens,
        costUsd: `$${costUsd.toFixed(5)}`,
      });

      return {
        text,
        model: msg.model,
        latencyMs,
        inputTokens,
        outputTokens,
        tokensUsed,
        costUsd,
      };
    } catch (err) {
      if (err instanceof Anthropic.APIError) {
        logger.error('[AI] Claude API error', { status: err.status, message: err.message });

        if (err.status === 429) {
          const e = new Error('Rate limit exceeded. Please try again in a moment.');
          (e as Error & { statusCode: number }).statusCode = 429;
          throw e;
        }

        if (err.status === 401) {
          const e = new Error('Invalid Claude API key. Check ANTHROPIC_API_KEY.');
          (e as Error & { statusCode: number }).statusCode = 500;
          throw e;
        }

        if (err.status >= 500) {
          const e = new Error('Claude service is temporarily unavailable.');
          (e as Error & { statusCode: number }).statusCode = 503;
          throw e;
        }
      }

      throw err;
    }
  }

  async isAvailable(): Promise<boolean> {
    try {
      await this.client.models.list();
      return true;
    } catch {
      return false;
    }
  }
}

export const aiService = new ClaudeAiService();
