/**
 * Types and interfaces for claude-lite-llm-ts.
 */

export type Role = 'system' | 'user' | 'assistant';

export interface Message {
  role: Role | string;
  content: string;
}

export interface UsageInfo {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  totalCostUsd: number;
}

export interface ClaudeResponse {
  content: string;
  sessionId?: string;
  durationMs: number;
  usage: UsageInfo;
  raw?: Record<string, unknown>;
}

export interface ClaudeClientOptions {
  /**
   * Anthropic subscription token (`CLAUDE_CODE_TOKEN`).
   * Defaults to reading from environment or `.env` file.
   */
  token?: string;
  /**
   * Custom path to the `claude` CLI binary executable.
   */
  claudePath?: string;
  /**
   * Optional path to `.env` file.
   */
  envFile?: string;
  /**
   * Default model to use (e.g., 'sonnet', 'opus', 'haiku', 'claude-3-7-sonnet-latest').
   */
  defaultModel?: string;
  /**
   * Default system instructions to prepend.
   */
  defaultSystemPrompt?: string;
  /**
   * Working directory for CLI execution.
   */
  cwd?: string;
}

export interface CompletionOptions {
  /**
   * Model name or alias (e.g. 'sonnet', 'claude-3-7-sonnet-latest', 'opus', 'haiku').
   */
  model?: string;
  /**
   * System prompt instructions.
   */
  systemPrompt?: string;
  /**
   * Built-in tools allowed. Defaults to `""` (empty string) to disable all tools
   * for pure text LLM generation. Set to `null` to use CLI default tools.
   */
  tools?: string | string[] | null;
  /**
   * Session ID for multi-turn conversations or pinned sessions.
   */
  sessionId?: string;
  /**
   * Avoid saving session history to disk (default true).
   */
  noSessionPersistence?: boolean;
  /**
   * Dangerously skip CLI permission prompts (default false).
   */
  dangerouslySkipPermissions?: boolean;
  /**
   * Command execution timeout in milliseconds.
   */
  timeoutMs?: number;
}

/**
 * OpenAI / LiteLLM compatible request parameters.
 */
export interface ChatCompletionRequest {
  model: string;
  messages: Message[];
  temperature?: number;
  max_tokens?: number;
  stream?: boolean;
  system?: string;
  tools?: unknown;
  timeout?: number;
  [key: string]: unknown;
}

/**
 * OpenAI / LiteLLM compatible response structure.
 */
export interface ChatCompletionChoice {
  index: number;
  message: {
    role: 'assistant';
    content: string;
  };
  finish_reason: 'stop' | 'length' | 'tool_calls' | 'content_filter' | null;
}

export interface ChatCompletionUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  total_cost_usd?: number;
}

export interface ModelResponse {
  id: string;
  object: 'chat.completion';
  created: number;
  model: string;
  choices: ChatCompletionChoice[];
  usage: ChatCompletionUsage;
  session_id?: string;
  duration_ms?: number;
}

/**
 * LiteLLM custom provider handler interface.
 */
export interface CustomLLMHandler {
  completion(params: ChatCompletionRequest): Promise<ModelResponse>;
  acompletion?(params: ChatCompletionRequest): Promise<ModelResponse>;
}

export interface CustomProviderEntry {
  provider: string;
  custom_handler: CustomLLMHandler;
}
