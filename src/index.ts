/**
 * @santhoshdasari/claude-lite-llm-ts
 *
 * Programmatic Claude CLI wrapper and LiteLLM custom provider powered by Claude subscriptions.
 */

export { ClaudeClient } from './client.js';
export { ClaudeSubscriptionProvider, type ClaudeSubscriptionProviderOptions } from './provider.js';
export { litellm, LiteLLMManager } from './litellm.js';
export { createClaudeServer, serveClaudeProxy, type ServerOptions } from './server.js';
export { completion, completionStream, createClient, greet } from './core.js';
export {
  ClaudeError,
  ClaudeAuthError,
  ClaudeCLINotFoundError,
  ClaudeRateLimitError,
  ClaudeExecutionError,
} from './exceptions.js';
export type {
  Role,
  Message,
  UsageInfo,
  ClaudeResponse,
  ClaudeStreamChunk,
  ClaudeClientOptions,
  CompletionOptions,
  ChatCompletionRequest,
  ChatCompletionChoice,
  ChatCompletionUsage,
  ChatCompletionChunk,
  ChatCompletionChunkChoice,
  ModelResponse,
  CustomLLMHandler,
  CustomProviderEntry,
  ToolDefinition,
  FunctionDefinition,
  ToolCall,
} from './types.js';
