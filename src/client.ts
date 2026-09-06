/**
 * Core Claude CLI client wrapper for programmatic execution using subscription authentication.
 */

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import dotenv from 'dotenv';
import {
  ClaudeAuthError,
  ClaudeCLINotFoundError,
  ClaudeExecutionError,
  ClaudeRateLimitError,
} from './exceptions.js';
import type {
  ClaudeClientOptions,
  ClaudeResponse,
  ClaudeStreamChunk,
  CompletionOptions,
  Message,
  UsageInfo,
} from './types.js';

export class ClaudeClient {
  public readonly token?: string;
  public readonly claudePath: string;
  public readonly defaultModel?: string;
  public readonly defaultSystemPrompt?: string;
  public readonly cwd?: string;

  constructor(options: ClaudeClientOptions = {}) {
    if (options.envFile) {
      dotenv.config({ path: path.resolve(options.envFile), override: true, quiet: true });
    } else {
      dotenv.config({ quiet: true });
    }

    this.token = options.token || process.env.CLAUDE_CODE_TOKEN;
    this.defaultModel = options.defaultModel;
    this.defaultSystemPrompt = options.defaultSystemPrompt;
    this.cwd = options.cwd ? path.resolve(options.cwd) : undefined;
    this.claudePath = this.resolveClaudePath(options.claudePath);
  }

  /**
   * Resolves the path to the `claude` executable.
   */
  public resolveClaudePath(customPath?: string): string {
    if (customPath) {
      const resolved = path.resolve(customPath.replace(/^~(?=$|\/|\\)/, os.homedir()));
      if (this.isExecutable(resolved)) {
        return resolved;
      }
      throw new ClaudeCLINotFoundError(
        `Specified claude binary not found or not executable: ${customPath}`,
      );
    }

    const envBin = process.env.CLAUDE_BIN;
    if (envBin) {
      const resolved = path.resolve(envBin.replace(/^~(?=$|\/|\\)/, os.homedir()));
      if (this.isExecutable(resolved)) {
        return resolved;
      }
    }

    // Check PATH environment variable
    const pathEnv = process.env.PATH || '';
    const pathDirs = pathEnv.split(path.delimiter);
    for (const dir of pathDirs) {
      const candidate = path.join(dir, 'claude');
      if (this.isExecutable(candidate)) {
        return candidate;
      }
    }

    // Check standard installation paths
    const home = os.homedir();
    const candidatePaths = [
      path.join(home, '.local', 'bin', 'claude'),
      path.join(home, '.npm-global', 'bin', 'claude'),
      '/usr/local/bin/claude',
      '/opt/homebrew/bin/claude',
    ];

    for (const candidate of candidatePaths) {
      if (this.isExecutable(candidate)) {
        return candidate;
      }
    }

    throw new ClaudeCLINotFoundError(
      'Could not locate `claude` executable in PATH or standard directories. ' +
        'Ensure Claude Code is installed and accessible (npm i -g @anthropic-ai/claude-code).',
    );
  }

  private isExecutable(filePath: string): boolean {
    try {
      const stat = fs.statSync(filePath);
      if (!stat.isFile()) return false;
      fs.accessSync(filePath, fs.constants.X_OK);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Constructs the execution environment dictionary.
   */
  public buildEnv(): NodeJS.ProcessEnv {
    const env: NodeJS.ProcessEnv = { ...process.env };
    if (this.token) {
      env.CLAUDE_CODE_TOKEN = this.token;
    } else {
      delete env.CLAUDE_CODE_TOKEN;
    }
    return env;
  }

  /**
   * Normalizes a string prompt or list of messages into prompt text and system instructions.
   */
  public formatPrompt(prompt: string | Message[]): {
    promptText: string;
    extractedSystemPrompt?: string;
  } {
    if (typeof prompt === 'string') {
      return { promptText: prompt };
    }

    const messages = Array.isArray(prompt) ? prompt : [prompt];
    const systemParts: string[] = [];
    const conversationParts: string[] = [];

    for (const msg of messages) {
      const role = String(msg.role || 'user').toLowerCase();
      const content = String(msg.content || '');

      if (role === 'system') {
        systemParts.push(content);
      } else if (role === 'assistant') {
        conversationParts.push(`Assistant: ${content}`);
      } else if (role === 'tool') {
        conversationParts.push(
          `Tool Result [${msg.name || msg.tool_call_id || 'tool'}]: ${content}`,
        );
      } else {
        conversationParts.push(`User: ${content}`);
      }
    }

    const extractedSystemPrompt = systemParts.length > 0 ? systemParts.join('\n\n') : undefined;

    // If there is only one user message, pass it directly without 'User: ' prefix
    const firstPart = conversationParts[0];
    if (conversationParts.length === 1 && firstPart?.startsWith('User: ')) {
      return {
        promptText: firstPart.substring(6),
        extractedSystemPrompt,
      };
    }

    return {
      promptText: conversationParts.join('\n\n'),
      extractedSystemPrompt,
    };
  }

  /**
   * Constructs the CLI argument array for `claude`.
   */
  public buildCommand(
    promptText: string,
    options: CompletionOptions = {},
    stream = false,
  ): { cmd: string; args: string[] } {
    const args: string[] = ['-p', promptText];

    if (stream) {
      args.push('--output-format', 'stream-json', '--verbose', '--include-partial-messages');
    } else {
      args.push('--output-format', 'json');
    }

    const noSessionPersistence = options.noSessionPersistence ?? true;
    if (noSessionPersistence && !options.sessionId) {
      args.push('--no-session-persistence');
    }

    const effectiveModel = options.model || this.defaultModel;
    if (effectiveModel) {
      args.push('--model', effectiveModel);
    }

    const effectiveSystemPrompt = options.systemPrompt || this.defaultSystemPrompt;
    if (effectiveSystemPrompt) {
      args.push('--system-prompt', effectiveSystemPrompt);
    }

    // Built-in tools: default to empty string "" to ensure safe LLM generation
    const tools = options.tools !== undefined ? options.tools : '';
    if (tools !== null) {
      const toolsStr = Array.isArray(tools) ? tools.join(',') : tools;
      args.push('--tools', toolsStr);
    }

    // JSON Schema for structured output
    if (options.jsonSchema) {
      const schemaStr =
        typeof options.jsonSchema === 'string'
          ? options.jsonSchema
          : JSON.stringify(options.jsonSchema);
      args.push('--json-schema', schemaStr);
    }

    // MCP server configuration
    if (options.mcpConfig) {
      if (Array.isArray(options.mcpConfig)) {
        args.push('--mcp-config', ...options.mcpConfig);
      } else {
        const mcpStr =
          typeof options.mcpConfig === 'string'
            ? options.mcpConfig
            : JSON.stringify(options.mcpConfig);
        args.push('--mcp-config', mcpStr);
      }
    }

    if (options.sessionId) {
      args.push('--session-id', options.sessionId);
    }

    if (options.dangerouslySkipPermissions) {
      args.push('--dangerously-skip-permissions');
    }

    return { cmd: this.claudePath, args };
  }

  /**
   * Parses JSON output from the Claude CLI process.
   */
  public parseOutput(stdout: string, stderr: string, returncode: number): ClaudeResponse {
    const cleanedStdout = stdout.trim();
    let data: Record<string, unknown> | null = null;

    if (cleanedStdout) {
      try {
        data = JSON.parse(cleanedStdout);
      } catch {
        data = null;
      }
    }

    if (data && typeof data === 'object' && !Array.isArray(data)) {
      const apiStatus = data.api_error_status as number | undefined;
      const resultStr = String(data.result || '');
      const isError = Boolean(data.is_error);

      if (apiStatus === 429 || resultStr.toLowerCase().includes('session limit')) {
        throw new ClaudeRateLimitError(resultStr, data);
      }

      if (
        apiStatus === 401 ||
        apiStatus === 403 ||
        resultStr.toLowerCase().includes('unauthorized') ||
        resultStr.toLowerCase().includes('invalid token')
      ) {
        throw new ClaudeAuthError(resultStr);
      }

      if (isError) {
        throw new ClaudeExecutionError(resultStr || 'Claude execution error returned by CLI', {
          returncode,
          stdout,
          stderr,
          rawResponse: data,
        });
      }

      const usageDict = (data.usage as Record<string, unknown>) || {};
      const totalCost = Number(data.total_cost_usd || 0);

      const inputTokens = Number(usageDict.input_tokens || 0);
      const outputTokens = Number(usageDict.output_tokens || 0);

      const usage: UsageInfo = {
        inputTokens,
        outputTokens,
        totalTokens: inputTokens + outputTokens,
        totalCostUsd: totalCost,
      };

      return {
        content: resultStr,
        sessionId: data.session_id ? String(data.session_id) : undefined,
        durationMs: Number(data.duration_ms || 0),
        usage,
        structuredOutput: data.structured_output,
        raw: data,
      };
    }

    // Fallback for non-JSON output or errors
    if (returncode !== 0) {
      const errorMessage =
        stderr.trim() || cleanedStdout || `Claude CLI exited with code ${returncode}`;
      const lowerMsg = errorMessage.toLowerCase();

      if (
        lowerMsg.includes('auth') ||
        lowerMsg.includes('token') ||
        lowerMsg.includes('login') ||
        lowerMsg.includes('unauthorized')
      ) {
        throw new ClaudeAuthError(errorMessage);
      }

      if (
        lowerMsg.includes('429') ||
        lowerMsg.includes('rate limit') ||
        lowerMsg.includes('quota')
      ) {
        throw new ClaudeRateLimitError(errorMessage);
      }

      throw new ClaudeExecutionError(errorMessage, {
        returncode,
        stdout,
        stderr,
      });
    }

    return {
      content: cleanedStdout,
      durationMs: 0,
      usage: {
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        totalCostUsd: 0,
      },
      raw: { rawStdout: cleanedStdout, rawStderr: stderr },
    };
  }

  /**
   * Executes completion against the Claude CLI programmatically.
   */
  public async completion(
    prompt: string | Message[],
    options: CompletionOptions = {},
  ): Promise<ClaudeResponse> {
    const { promptText, extractedSystemPrompt } = this.formatPrompt(prompt);

    const mergedOptions: CompletionOptions = {
      ...options,
      systemPrompt: options.systemPrompt || extractedSystemPrompt || this.defaultSystemPrompt,
    };

    const { cmd, args } = this.buildCommand(promptText, mergedOptions, false);
    const env = this.buildEnv();

    return new Promise<ClaudeResponse>((resolve, reject) => {
      const child = spawn(cmd, args, {
        env,
        cwd: this.cwd,
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      let stdout = '';
      let stderr = '';
      let timedOut = false;
      let timer: NodeJS.Timeout | undefined;

      if (options.timeoutMs && options.timeoutMs > 0) {
        timer = setTimeout(() => {
          timedOut = true;
          child.kill('SIGTERM');
          setTimeout(() => {
            if (!child.killed) child.kill('SIGKILL');
          }, 2000);
          reject(
            new ClaudeExecutionError(`Claude CLI execution timed out after ${options.timeoutMs}ms`),
          );
        }, options.timeoutMs);
      }

      child.stdout.on('data', (chunk) => {
        stdout += chunk.toString('utf-8');
      });

      child.stderr.on('data', (chunk) => {
        stderr += chunk.toString('utf-8');
      });

      child.on('error', (err) => {
        if (timer) clearTimeout(timer);
        reject(new ClaudeExecutionError(`Failed to spawn claude CLI process: ${err.message}`));
      });

      child.on('close', (code) => {
        if (timer) clearTimeout(timer);
        if (timedOut) return;

        try {
          const response = this.parseOutput(stdout, stderr, code ?? 0);
          resolve(response);
        } catch (err) {
          reject(err);
        }
      });
    });
  }

  /**
   * Executes real-time token streaming completion against the Claude CLI.
   * Yields text chunks as they are generated by the model.
   */
  public async *completionStream(
    prompt: string | Message[],
    options: CompletionOptions = {},
  ): AsyncIterable<ClaudeStreamChunk> {
    const { promptText, extractedSystemPrompt } = this.formatPrompt(prompt);

    const mergedOptions: CompletionOptions = {
      ...options,
      systemPrompt: options.systemPrompt || extractedSystemPrompt || this.defaultSystemPrompt,
    };

    const { cmd, args } = this.buildCommand(promptText, mergedOptions, true);
    const env = this.buildEnv();

    const child = spawn(cmd, args, {
      env,
      cwd: this.cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    const queue: Array<{ chunk?: ClaudeStreamChunk; error?: Error; done?: boolean }> = [];
    let notify: (() => void) | null = null;

    const push = (item: { chunk?: ClaudeStreamChunk; error?: Error; done?: boolean }) => {
      queue.push(item);
      if (notify) {
        notify();
        notify = null;
      }
    };

    let buffer = '';
    let stderr = '';

    child.stdout.on('data', (data: Buffer) => {
      buffer += data.toString('utf-8');
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        try {
          const parsed = JSON.parse(trimmed) as Record<string, unknown>;
          const type = parsed.type as string | undefined;

          if (type === 'stream_event') {
            const event = parsed.event as Record<string, unknown> | undefined;
            if (event?.type === 'content_block_delta') {
              const delta = event.delta as Record<string, unknown> | undefined;
              if (typeof delta?.text === 'string' && delta.text) {
                push({ chunk: { type: 'delta', text: delta.text, raw: parsed } });
              }
            }
          } else if (type === 'result') {
            const usageDict = (parsed.usage as Record<string, unknown>) || {};
            const inputTokens = Number(usageDict.input_tokens || 0);
            const outputTokens = Number(usageDict.output_tokens || 0);
            const usage: UsageInfo = {
              inputTokens,
              outputTokens,
              totalTokens: inputTokens + outputTokens,
              totalCostUsd: Number(parsed.total_cost_usd || 0),
            };

            push({
              chunk: {
                type: 'final',
                text: '',
                usage,
                sessionId: parsed.session_id ? String(parsed.session_id) : undefined,
                raw: parsed,
              },
            });
          }
        } catch {
          // Ignore non-JSON log lines
        }
      }
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString('utf-8');
    });

    child.on('error', (err) => {
      push({
        error: new ClaudeExecutionError(`Failed to spawn claude stream: ${err.message}`),
      });
    });

    child.on('close', (code) => {
      if (code !== 0 && queue.length === 0) {
        const lower = stderr.toLowerCase();
        if (lower.includes('auth') || lower.includes('token') || lower.includes('unauthorized')) {
          push({ error: new ClaudeAuthError(stderr) });
        } else if (lower.includes('429') || lower.includes('session limit')) {
          push({ error: new ClaudeRateLimitError(stderr) });
        } else {
          push({
            error: new ClaudeExecutionError(`Claude CLI exited with code ${code}: ${stderr}`, {
              returncode: code ?? undefined,
              stderr,
            }),
          });
        }
      }
      push({ done: true });
    });

    try {
      while (true) {
        if (queue.length === 0) {
          await new Promise<void>((res) => {
            notify = res;
          });
        }

        const next = queue.shift();
        if (!next) continue;

        if (next.error) {
          throw next.error;
        }

        if (next.done) {
          break;
        }

        if (next.chunk) {
          yield next.chunk;
        }
      }
    } finally {
      if (!child.killed) {
        child.kill('SIGTERM');
      }
    }
  }
}
