/**
 * @santhoshdasari/claude-lite-llm-ts
 *
 * Programmatic Claude & Codex CLI wrapper and LiteLLM custom provider powered by subscriptions.
 */

// Claude
export { ClaudeClient } from './client.js';
export { ClaudeSubscriptionProvider, type ClaudeSubscriptionProviderOptions } from './provider.js';
export { completion, completionStream, createClient } from './core.js';
export {
  ClaudeError,
  ClaudeAuthError,
  ClaudeCLINotFoundError,
  ClaudeRateLimitError,
  ClaudeExecutionError,
} from './exceptions.js';

// Codex
export { CodexClient } from './codex-client.js';
export {
  CodexSubscriptionProvider,
  type CodexSubscriptionProviderOptions,
} from './codex-provider.js';
export { codexCompletion, codexCompletionStream, createCodexClient } from './core.js';
export {
  CodexError,
  CodexAuthError,
  CodexCLINotFoundError,
  CodexRateLimitError,
  CodexExecutionError,
} from './exceptions.js';

// LiteLLM & Proxy Server
export { litellm, LiteLLMManager } from './litellm.js';
export {
  createProxyServer,
  createClaudeServer,
  serveProxy,
  serveClaudeProxy,
  type ServerOptions,
} from './server.js';
export { greet } from './core.js';

// Usage Tracking, Status & Limits
export {
  UsageTracker,
  globalUsageTracker,
  resolveModelLimits,
  formatTokenCount,
  KNOWN_MODEL_LIMITS,
  DEFAULT_MODEL_LIMIT,
} from './usage-tracker.js';
export {
  maskSecret,
  getProviderStatus,
  readClaudePersistentStats,
  readCodexPersistentStats,
} from './usage-reader.js';
export {
  getSessionUsage,
  getUsageLimits,
  checkUsageLimit,
  getStatus,
  getStatusLine,
  resetSessionUsage,
  clearAllUsage,
} from './core.js';

// Shared Types
export { USAGE_REPORT_VERSION } from './usage-types.js';
export type {
  Role,
  Message,
  UsageInfo,
  ClaudeResponse,
  ClaudeStreamChunk,
  ClaudeClientOptions,
  CompletionOptions,
  CodexClientOptions,
  CodexCompletionOptions,
  CodexResponse,
  CodexStreamChunk,
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
  UsageLimitStatus,
  UsageProviderType,
  ModelLimitSpec,
  SessionUsage,
  UsageLimits,
  UsageLimitPolicy,
  UsageLimitCheckResult,
  StatusReport,
  StatusLineOptions,
  RecordUsageParams,
} from './types.js';
