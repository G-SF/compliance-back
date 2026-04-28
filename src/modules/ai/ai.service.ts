/**
 * AI Service — Placeholder Implementation
 *
 * This module is intentionally NOT implemented yet.
 * It exists to:
 *  1. Reserve the architectural slot so other modules can import IAiService
 *     without knowing which model backs it.
 *  2. Return a clear "not implemented" response so the API doesn't crash when
 *     an AI endpoint is called before the model is available.
 *
 * ┌─────────────────────────────────────────────────────────────┐
 * │  HOW TO WIRE IN LLAMA 8B (when ready)                       │
 * │                                                             │
 * │  Option A — Ollama (recommended for local dev)              │
 * │    1. Run: ollama run llama3                                 │
 * │    2. Create OllamaAiService implements IAiService          │
 * │    3. POST http://localhost:11434/api/generate               │
 * │                                                             │
 * │  Option B — llama.cpp HTTP server                           │
 * │    1. Build llama.cpp with server target                    │
 * │    2. Create LlamaCppAiService implements IAiService        │
 * │    3. POST http://localhost:8080/completion                  │
 * │                                                             │
 * │  Option C — Remote / cloud endpoint                         │
 * │    1. Store API URL + key in .env                           │
 * │    2. Create RemoteAiService implements IAiService          │
 * └─────────────────────────────────────────────────────────────┘
 */

import { IAiService, AiPromptOptions, AiResponse } from './ai.interface';

class PlaceholderAiService implements IAiService {
  async complete(_options: AiPromptOptions): Promise<AiResponse> {
    // TODO: replace with a real provider implementation
    return {
      text: '[AI service not yet configured. See src/modules/ai/ai.service.ts for integration instructions.]',
      model: 'placeholder',
      latencyMs: 0,
    };
  }

  async isAvailable(): Promise<boolean> {
    // Until a real provider is wired, always report unavailable
    return false;
  }
}

/**
 * Exported singleton — swap the concrete class here without touching anything else.
 *
 * Example after integrating Ollama:
 *   export const aiService: IAiService = new OllamaAiService();
 */
export const aiService: IAiService = new PlaceholderAiService();
