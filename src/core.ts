/**
 * Convenience functions and core interfaces for claude-lite-llm-ts.
 */

import { ClaudeClient } from './client.js';
import type {
  ClaudeClientOptions,
  ClaudeResponse,
  ClaudeStreamChunk,
  CompletionOptions,
  Message,
} from './types.js';

/**
 * Creates and configures a new `ClaudeClient` instance.
 */
export function createClient(options: ClaudeClientOptions = {}): ClaudeClient {
  return new ClaudeClient(options);
}

/**
 * Top-level convenience function to send a prompt to Claude using subscription authentication.
 *
 * @param prompt - Text prompt string or array of Message objects.
 * @param options - Completion options and optional client configuration overrides.
 *
 * Usage:
 * ```typescript
 * import { completion } from '@santhoshdasari/claude-lite-llm-ts';
 *
 * const response = await completion('Explain quantum computing in 2 sentences');
 * console.log(response.content);
 * ```
 */
export async function completion(
  prompt: string | Message[],
  options: CompletionOptions & ClaudeClientOptions = {},
): Promise<ClaudeResponse> {
  const client = new ClaudeClient({
    token: options.token,
    claudePath: options.claudePath,
    envFile: options.envFile,
    defaultModel: options.defaultModel,
    defaultSystemPrompt: options.defaultSystemPrompt,
    cwd: options.cwd,
  });

  return client.completion(prompt, options);
}

/**
 * Top-level convenience function to stream responses in real time.
 *
 * Usage:
 * ```typescript
 * import { completionStream } from '@santhoshdasari/claude-lite-llm-ts';
 *
 * for await (const chunk of completionStream('Count 1 to 5')) {
 *   if (chunk.type === 'delta') process.stdout.write(chunk.text);
 * }
 * ```
 */
export async function* completionStream(
  prompt: string | Message[],
  options: CompletionOptions & ClaudeClientOptions = {},
): AsyncIterable<ClaudeStreamChunk> {
  const client = new ClaudeClient({
    token: options.token,
    claudePath: options.claudePath,
    envFile: options.envFile,
    defaultModel: options.defaultModel,
    defaultSystemPrompt: options.defaultSystemPrompt,
    cwd: options.cwd,
  });

  yield* client.completionStream(prompt, options);
}

/**
 * Creates and configures a new `CodexClient` instance.
 */
import { CodexClient } from './codex-client.js';
import type {
  CodexClientOptions,
  CodexCompletionOptions,
  CodexResponse,
  CodexStreamChunk,
  SessionUsage,
  StatusLineOptions,
  StatusReport,
  UsageLimitCheckResult,
  UsageLimitPolicy,
  UsageLimits,
  UsageProviderType,
} from './types.js';
import { getProviderStatus } from './usage-reader.js';
import { globalUsageTracker } from './usage-tracker.js';

export function createCodexClient(options: CodexClientOptions = {}): CodexClient {
  return new CodexClient(options);
}

/**
 * Top-level convenience function to send a prompt to Codex using subscription / API authentication.
 *
 * @param prompt - Text prompt string or array of Message objects.
 * @param options - Completion options and optional client configuration overrides.
 *
 * Usage:
 * ```typescript
 * import { codexCompletion } from '@santhoshdasari/claude-lite-llm-ts';
 *
 * const response = await codexCompletion('Explain Dijkstra algorithm in 2 sentences');
 * console.log(response.content);
 * ```
 */
export async function codexCompletion(
  prompt: string | Message[],
  options: CodexCompletionOptions & CodexClientOptions = {},
): Promise<CodexResponse> {
  const client = new CodexClient({
    apiKey: options.apiKey,
    codexPath: options.codexPath,
    envFile: options.envFile,
    defaultModel: options.defaultModel,
    defaultSystemPrompt: options.defaultSystemPrompt,
    cwd: options.cwd,
  });

  return client.completion(prompt, options);
}

/**
 * Top-level convenience function to stream responses from Codex in real time.
 *
 * Usage:
 * ```typescript
 * import { codexCompletionStream } from '@santhoshdasari/claude-lite-llm-ts';
 *
 * for await (const chunk of codexCompletionStream('Count 1 to 5')) {
 *   if (chunk.type === 'delta') process.stdout.write(chunk.text);
 * }
 * ```
 */
export async function* codexCompletionStream(
  prompt: string | Message[],
  options: CodexCompletionOptions & CodexClientOptions = {},
): AsyncIterable<CodexStreamChunk> {
  const client = new CodexClient({
    apiKey: options.apiKey,
    codexPath: options.codexPath,
    envFile: options.envFile,
    defaultModel: options.defaultModel,
    defaultSystemPrompt: options.defaultSystemPrompt,
    cwd: options.cwd,
  });

  yield* client.completionStream(prompt, options);
}

/**
 * Backwards-compatibility greeting utility.
 */
export function greet(name: string): string {
  if (!name || !name.trim()) {
    throw new Error('name must not be empty');
  }
  return `Hello, ${name}!`;
}

/**
 * Top-level convenience function to get session usage.
 */
export function getSessionUsage(
  sessionId?: string,
  provider: UsageProviderType = 'claude',
): SessionUsage {
  return globalUsageTracker.getOrCreateSession(sessionId, provider);
}

/**
 * Top-level convenience function to calculate usage limits and context window percentage.
 */
export function getUsageLimits(
  sessionId?: string,
  model?: string,
  policy?: UsageLimitPolicy,
): UsageLimits {
  const session = globalUsageTracker.getOrCreateSession(sessionId);
  return globalUsageTracker.calculateLimits(session, model, policy);
}

/**
 * Top-level convenience function to check whether a session is within specified limits.
 */
export function checkUsageLimit(
  sessionId?: string,
  model?: string,
  policy?: UsageLimitPolicy,
): UsageLimitCheckResult {
  return globalUsageTracker.checkLimit(sessionId, model, policy);
}

/**
 * Top-level convenience function to get environment and provider status diagnostics.
 */
export async function getStatus(
  provider: UsageProviderType = 'claude',
  sessionId?: string,
): Promise<StatusReport> {
  return getProviderStatus({
    provider,
    usageTracker: globalUsageTracker,
    sessionId,
  });
}

/**
 * Top-level convenience function to format a single statusline.
 */
export function getStatusLine(options: StatusLineOptions = {}): string {
  return globalUsageTracker.formatStatusLine(options.sessionId, options);
}

/**
 * Resets usage tracking for a specific session.
 */
export function resetSessionUsage(sessionId: string): void {
  globalUsageTracker.resetSession(sessionId);
}

/**
 * Clears all usage tracking in the global tracker.
 */
export function clearAllUsage(): void {
  globalUsageTracker.clear();
}
