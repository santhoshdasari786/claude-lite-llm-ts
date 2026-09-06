/**
 * ClaudeSubscriptionProvider - Custom provider adapter for LiteLLM compatibility.
 */

import { randomUUID } from 'node:crypto';
import { ClaudeClient } from './client.js';
import type {
  ChatCompletionRequest,
  ClaudeClientOptions,
  CustomLLMHandler,
  ModelResponse,
} from './types.js';

export interface ClaudeSubscriptionProviderOptions extends ClaudeClientOptions {
  /**
   * Optional custom ClaudeClient instance to use.
   */
  client?: ClaudeClient;
  /**
   * Optional provider name prefix to strip from model name (defaults to 'claude_sub').
   */
  providerPrefix?: string;
}

/**
 * LiteLLM custom provider handler for Claude subscription authentication.
 *
 * Usage with LiteLLM:
 * ```typescript
 * const claudeProvider = new ClaudeSubscriptionProvider();
 * litellm.custom_provider_map = [
 *   { provider: 'claude_sub', custom_handler: claudeProvider }
 * ];
 *
 * const response = await litellm.completion({
 *   model: 'claude_sub/sonnet',
 *   messages: [{ role: 'user', content: 'Hello!' }]
 * });
 * ```
 */
export class ClaudeSubscriptionProvider implements CustomLLMHandler {
  public readonly client: ClaudeClient;
  public readonly providerPrefix: string;

  constructor(options: ClaudeSubscriptionProviderOptions = {}) {
    this.client = options.client || new ClaudeClient(options);
    this.providerPrefix = options.providerPrefix || 'claude_sub';
  }

  /**
   * Normalizes model string by stripping provider prefix (e.g., 'claude_sub/sonnet' -> 'sonnet').
   */
  public cleanModelName(model: string): string {
    if (!model) return '';
    const prefix = `${this.providerPrefix}/`;
    if (model.startsWith(prefix)) {
      return model.slice(prefix.length);
    }
    // Also strip generic claude-sub/ prefix
    if (model.startsWith('claude-sub/')) {
      return model.slice('claude-sub/'.length);
    }
    return model;
  }

  /**
   * Executes completion conforming to LiteLLM / OpenAI custom provider standard.
   */
  public async completion(params: ChatCompletionRequest): Promise<ModelResponse> {
    const rawModel = params.model || '';
    const cleanModel = this.cleanModelName(rawModel);
    const messages = params.messages || [];

    const timeoutMs = params.timeout ? params.timeout * 1000 : undefined;

    const res = await this.client.completion(messages, {
      model: cleanModel || undefined,
      timeoutMs,
    });

    const created = Math.floor(Date.now() / 1000);
    const completionId = `chatcmpl-${randomUUID()}`;

    return {
      id: completionId,
      object: 'chat.completion',
      created,
      model: cleanModel || rawModel || 'claude',
      choices: [
        {
          index: 0,
          message: {
            role: 'assistant',
            content: res.content,
          },
          finish_reason: 'stop',
        },
      ],
      usage: {
        prompt_tokens: res.usage.inputTokens,
        completion_tokens: res.usage.outputTokens,
        total_tokens: res.usage.totalTokens,
        total_cost_usd: res.usage.totalCostUsd,
      },
      session_id: res.sessionId,
      duration_ms: res.durationMs,
    };
  }

  /**
   * Async completion alias for LiteLLM python / acompletion parity.
   */
  public async acompletion(params: ChatCompletionRequest): Promise<ModelResponse> {
    return this.completion(params);
  }
}
