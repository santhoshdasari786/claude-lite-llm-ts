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
 * Backwards-compatibility greeting utility.
 */
export function greet(name: string): string {
  if (!name || !name.trim()) {
    throw new Error('name must not be empty');
  }
  return `Hello, ${name}!`;
}
