/**
 * Types and interfaces for claude-lite-llm-ts.
 */

export type Role = 'system' | 'user' | 'assistant' | 'tool';

export interface Message {
  role: Role | string;
  content: string;
  name?: string;
  tool_call_id?: string;
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
  structuredOutput?: unknown;
  raw?: Record<string, unknown>;
}

export interface ClaudeStreamChunk {
  type: 'delta' | 'final';
  text: string;
  usage?: UsageInfo;
  sessionId?: string;
  raw?: unknown;
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
   * Can also be a comma-separated string or array like `['Read', 'Glob', 'Grep']`.
   */
  tools?: string | string[] | null;
  /**
   * JSON Schema for structured output validation.
   * Passed directly to Claude CLI `--json-schema`.
   */
  jsonSchema?: string | Record<string, unknown>;
  /**
   * Load MCP (Model Context Protocol) servers from JSON files or strings.
   * Passed directly to Claude CLI `--mcp-config`.
   */
  mcpConfig?: string | string[] | Record<string, unknown>;
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
 * Tool / Function Calling definitions conforming to OpenAI / LiteLLM standard.
 */
export interface FunctionDefinition {
  name: string;
  description?: string;
  parameters?: Record<string, unknown>;
}

export interface ToolDefinition {
  type: 'function';
  function: FunctionDefinition;
}

export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
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
  tools?: ToolDefinition[];
  tool_choice?:
    'none' | 'auto' | 'required' | { type: 'function'; function: { name: string } } | unknown;
  response_format?: {
    type: 'json_object' | 'json_schema';
    json_schema?: { schema: Record<string, unknown> };
  };
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
    content: string | null;
    tool_calls?: ToolCall[];
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
 * Streaming chunk types conforming to OpenAI / LiteLLM standard.
 */
export interface ChatCompletionChunkChoice {
  index: number;
  delta: {
    role?: 'assistant';
    content?: string;
    tool_calls?: Array<{
      index?: number;
      id?: string;
      type?: 'function';
      function?: {
        name?: string;
        arguments?: string;
      };
    }>;
  };
  finish_reason: 'stop' | 'length' | 'tool_calls' | null;
}

export interface ChatCompletionChunk {
  id: string;
  object: 'chat.completion.chunk';
  created: number;
  model: string;
  choices: ChatCompletionChunkChoice[];
  usage?: ChatCompletionUsage;
}

/**
 * LiteLLM custom provider handler interface.
 */
export interface CustomLLMHandler {
  completion(
    params: ChatCompletionRequest,
  ):
    | Promise<ModelResponse | AsyncIterable<ChatCompletionChunk>>
    | AsyncIterable<ChatCompletionChunk>;
  acompletion?(
    params: ChatCompletionRequest,
  ):
    | Promise<ModelResponse | AsyncIterable<ChatCompletionChunk>>
    | AsyncIterable<ChatCompletionChunk>;
}

export interface CustomProviderEntry {
  provider: string;
  custom_handler: CustomLLMHandler;
}

/**
 * Client configuration options for CodexClient.
 */
export interface CodexClientOptions {
  /**
   * OpenAI or Codex API key (`OPENAI_API_KEY` or `CODEX_API_KEY`).
   * Optional if authenticated via `codex login`.
   */
  apiKey?: string;
  /**
   * Custom path to the `codex` CLI binary executable.
   */
  codexPath?: string;
  /**
   * Optional path to `.env` file.
   */
  envFile?: string;
  /**
   * Default model to use (e.g. 'o3-mini', 'gpt-4o', 'o1').
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

/**
 * Completion options for Codex executions.
 */
export interface CodexCompletionOptions {
  /**
   * Model name or alias (e.g. 'o3-mini', 'gpt-4o', 'o1', 'codex').
   */
  model?: string;
  /**
   * System prompt instructions.
   */
  systemPrompt?: string;
  /**
   * Sandboxing mode (e.g. 'read-only', 'default', 'none').
   */
  sandbox?: string;
  /**
   * Whether to run in full-auto mode without confirmation prompts.
   */
  fullAuto?: boolean;
  /**
   * Avoid persisting session history to disk (default true).
   */
  ephemeral?: boolean;
  /**
   * Skip checking whether current working directory is a git repository.
   */
  skipGitRepoCheck?: boolean;
  /**
   * JSON Schema for structured output validation.
   */
  outputSchema?: string | Record<string, unknown>;
  /**
   * Command execution timeout in milliseconds.
   */
  timeoutMs?: number;
}

/**
 * Response structure returned by CodexClient.completion().
 */
export interface CodexResponse {
  content: string;
  sessionId?: string;
  durationMs: number;
  usage: UsageInfo;
  structuredOutput?: unknown;
  raw?: Record<string, unknown>;
}

/**
 * Stream chunk emitted by CodexClient.completionStream().
 */
export interface CodexStreamChunk {
  type: 'delta' | 'final';
  text: string;
  usage?: UsageInfo;
  sessionId?: string;
  raw?: unknown;
}
