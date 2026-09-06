/**
 * LiteLLM compatibility layer and provider router for TypeScript.
 */

import { ClaudeError } from './exceptions.js';
import type {
  ChatCompletionRequest,
  CustomLLMHandler,
  CustomProviderEntry,
  ModelResponse,
} from './types.js';

export class LiteLLMManager {
  private _customProviderMap: CustomProviderEntry[] = [];

  /**
   * Get registered custom provider map.
   */
  public get custom_provider_map(): CustomProviderEntry[] {
    return this._customProviderMap;
  }

  /**
   * Set or replace custom provider map.
   * Matches LiteLLM's `litellm.custom_provider_map = [{ provider, custom_handler }]`.
   */
  public set custom_provider_map(map: CustomProviderEntry[]) {
    this._customProviderMap = Array.isArray(map) ? [...map] : [];
  }

  /**
   * Register a custom provider handler.
   */
  public registerProvider(provider: string, customHandler: CustomLLMHandler): void {
    this._customProviderMap = this._customProviderMap.filter((e) => e.provider !== provider);
    this._customProviderMap.push({ provider, custom_handler: customHandler });
  }

  /**
   * Dispatches completion to the matching custom handler.
   */
  public async completion(params: ChatCompletionRequest): Promise<ModelResponse> {
    if (!params || !params.model) {
      throw new ClaudeError('Model must be specified in completion request', 'ERR_INVALID_REQUEST');
    }

    const modelStr = params.model;
    const parts = modelStr.split('/');
    const providerCandidate = parts.length > 1 ? parts[0] : '';

    let matchedEntry: CustomProviderEntry | undefined;

    if (providerCandidate) {
      matchedEntry = this._customProviderMap.find(
        (entry) => entry.provider.toLowerCase() === providerCandidate.toLowerCase(),
      );
    }

    // Fallback: if only one provider registered and no prefix matched
    if (!matchedEntry && this._customProviderMap.length === 1) {
      matchedEntry = this._customProviderMap[0];
    }

    if (!matchedEntry) {
      const registered = this._customProviderMap.map((e) => e.provider).join(', ') || 'none';
      throw new ClaudeError(
        `No custom provider found for model '${modelStr}'. Registered providers: [${registered}]. ` +
          `Register provider using litellm.custom_provider_map = [{ provider: "...", custom_handler: ... }]`,
        'ERR_PROVIDER_NOT_FOUND',
      );
    }

    return matchedEntry.custom_handler.completion(params);
  }

  /**
   * Async alias for parity with LiteLLM's acompletion.
   */
  public async acompletion(params: ChatCompletionRequest): Promise<ModelResponse> {
    return this.completion(params);
  }
}

/**
 * Singleton `litellm` compatibility instance.
 */
export const litellm = new LiteLLMManager();
