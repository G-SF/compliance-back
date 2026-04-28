/**
 * AI Service — Ollama Implementation
 *
 * Sends prompts to a locally running Ollama instance via HTTP.
 * Handles timeouts, basic retry logic, and structured error responses.
 *
 * Configuration (via environment variables / config):
 *   LLM_BASE_URL  — defaults to http://localhost:11434
 *   LLM_MODEL     — defaults to "mistral"
 */

import axios, { AxiosError } from 'axios';
import { IAiService, AiPromptOptions, AiResponse } from './ai.interface';
import { config } from '../../config';
import { logger } from '../../shared/utils/logger';

const MAX_RETRIES = 2;
const TIMEOUT_MS = 120_000; // 120 s — generation can be slow on first request

interface OllamaGenerateResponse {
  model: string;
  response: string;
  done: boolean;
}

class OllamaAiService implements IAiService {
  private readonly baseUrl: string;
  private readonly model: string;

  constructor() {
    this.baseUrl = config.llm.baseUrl;
    this.model = config.llm.model;
  }

  async complete(options: AiPromptOptions): Promise<AiResponse> {
    const { prompt } = options;
    const startTime = Date.now();

    let lastError: unknown;

    for (let attempt = 1; attempt <= MAX_RETRIES + 1; attempt++) {
      try {
        logger.info('[AI] Sending request to Ollama', { model: this.model, attempt });

        const res = await axios.post<OllamaGenerateResponse>(
          `${this.baseUrl}/api/generate`,
          { model: this.model, prompt, stream: false },
          { timeout: TIMEOUT_MS },
        );

        const latencyMs = Date.now() - startTime;
        logger.info('[AI] Response received', { latencyMs, model: res.data.model });

        return {
          text: res.data.response,
          model: res.data.model,
          latencyMs,
        };
      } catch (err) {
        lastError = err;

        const isRetryable =
          err instanceof AxiosError &&
          (!err.response || err.response.status >= 500 || err.code === 'ECONNABORTED');

        if (!isRetryable || attempt > MAX_RETRIES) break;

        logger.warn('[AI] Request failed, retrying...', { attempt });
        // Short back-off before retry
        await new Promise(r => setTimeout(r, 1000 * attempt));
      }
    }

    // Surface a clean error to the controller
    if (lastError instanceof AxiosError && !lastError.response) {
      const err = new Error('LLM service is unavailable. Please try again later.');
      (err as Error & { statusCode: number }).statusCode = 503;
      throw err;
    }

    throw lastError;
  }

  async isAvailable(): Promise<boolean> {
    try {
      const res = await axios.get(`${this.baseUrl}/api/tags`, { timeout: 5_000 });
      return res.status === 200;
    } catch {
      return false;
    }
  }
}

export const aiService = new OllamaAiService();
