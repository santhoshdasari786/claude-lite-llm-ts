/**
 * Core Codex CLI client wrapper for programmatic execution using subscription / API authentication.
 */

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';
import dotenv from 'dotenv';
import {
  CodexAuthError,
  CodexCLINotFoundError,
  CodexExecutionError,
  CodexRateLimitError,
} from './exceptions.js';
import type {
  CodexClientOptions,
  CodexCompletionOptions,
  CodexResponse,
  CodexStreamChunk,
  Message,
  UsageInfo,
} from './types.js';

export class CodexClient {
  public readonly apiKey?: string;
  public readonly codexPath: string;
  public readonly defaultModel?: string;
  public readonly defaultSystemPrompt?: string;
  public readonly cwd?: string;

  constructor(options: CodexClientOptions = {}) {
    if (options.envFile) {
      dotenv.config({ path: path.resolve(options.envFile), override: true, quiet: true });
    } else {
      dotenv.config({ quiet: true });
    }

    this.apiKey = options.apiKey || process.env.OPENAI_API_KEY || process.env.CODEX_API_KEY;
    this.defaultModel = options.defaultModel;
    this.defaultSystemPrompt = options.defaultSystemPrompt;
    this.cwd = options.cwd ? path.resolve(options.cwd) : undefined;

    try {
      this.codexPath = this.resolveCodexPath(options.codexPath);
    } catch (err) {
      if (options.codexPath) {
        throw err;
      }
      this.codexPath = '';
    }
  }

  /**
   * Resolves the path to the `codex` executable.
   */
  public resolveCodexPath(customPath?: string): string {
    if (customPath) {
      const resolved = path.resolve(customPath.replace(/^~(?=$|\/|\\)/, os.homedir()));
      if (this.isExecutable(resolved)) {
        return resolved;
      }
      throw new CodexCLINotFoundError(
        `Specified codex binary not found or not executable: ${customPath}`,
      );
    }

    const envBin = process.env.CODEX_BIN;
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
      const candidate = path.join(dir, 'codex');
      if (this.isExecutable(candidate)) {
        return candidate;
      }
    }

    // Check standard installation paths
    const home = os.homedir();
    const candidatePaths = [
      path.join(home, '.local', 'bin', 'codex'),
      path.join(home, '.npm-global', 'bin', 'codex'),
      '/usr/local/bin/codex',
      '/opt/homebrew/bin/codex',
    ];

    for (const candidate of candidatePaths) {
      if (this.isExecutable(candidate)) {
        return candidate;
      }
    }

    throw new CodexCLINotFoundError(
      'Could not locate `codex` executable in PATH or standard directories. ' +
        'Ensure Codex CLI is installed and accessible (npm i -g @openai/codex or brew install --cask codex).',
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

    if (this.apiKey) {
      env.OPENAI_API_KEY = this.apiKey;
      env.CODEX_API_KEY = this.apiKey;
    }

    return env;
  }

  /**
   * Formats prompt messages and system prompts into structured text.
   */
  public formatPrompt(
    prompt: string | Message[],
    explicitSystemPrompt?: string,
  ): { promptText: string; extractedSystemPrompt?: string } {
    let extractedSystemPrompt = explicitSystemPrompt || this.defaultSystemPrompt;

    if (typeof prompt === 'string') {
      return { promptText: prompt, extractedSystemPrompt };
    }

    if (!Array.isArray(prompt) || prompt.length === 0) {
      return { promptText: '', extractedSystemPrompt };
    }

    const systemMessages = prompt.filter((m) => m.role === 'system');
    if (systemMessages.length > 0) {
      const combined = systemMessages.map((m) => m.content).join('\n\n');
      extractedSystemPrompt = extractedSystemPrompt
        ? `${extractedSystemPrompt}\n\n${combined}`
        : combined;
    }

    const nonSystemMessages = prompt.filter((m) => m.role !== 'system');
    const firstMsg = nonSystemMessages[0];
    if (nonSystemMessages.length === 1 && firstMsg && firstMsg.role === 'user') {
      return {
        promptText: firstMsg.content,
        extractedSystemPrompt,
      };
    }

    const conversationText = nonSystemMessages
      .map((m) => {
        const roleName = m.role.charAt(0).toUpperCase() + m.role.slice(1);
        return `${roleName}: ${m.content}`;
      })
      .join('\n\n');

    return {
      promptText: conversationText,
      extractedSystemPrompt,
    };
  }

  /**
   * Builds the CLI arguments for executing `codex exec`.
   */
  public buildCommand(
    promptText: string,
    options: CodexCompletionOptions = {},
    systemPrompt?: string,
  ): { cmd: string; args: string[] } {
    const binary = this.codexPath || this.resolveCodexPath();
    const args: string[] = ['exec'];

    // Ephemeral (skip persisting session logs)
    if (options.ephemeral !== false) {
      args.push('--ephemeral');
    }

    // Skip git repository check (helpful in automation / CI)
    if (options.skipGitRepoCheck !== false) {
      args.push('--skip-git-repo-check');
    }

    // Model selection
    const model = options.model || this.defaultModel;
    if (model) {
      args.push('-c', `model="${model}"`);
    }

    // Sandbox configuration
    if (options.sandbox) {
      args.push('--sandbox', options.sandbox);
    }

    // Full-auto autonomous mode
    if (options.fullAuto) {
      args.push('--full-auto');
    }

    // Output schema
    if (options.outputSchema) {
      const schemaStr =
        typeof options.outputSchema === 'string'
          ? options.outputSchema
          : JSON.stringify(options.outputSchema);
      args.push('--output-schema', schemaStr);
    }

    // Combine system instructions with prompt if provided
    let finalPrompt = promptText;
    if (systemPrompt && systemPrompt.trim()) {
      finalPrompt = `Instructions:\n${systemPrompt.trim()}\n\nTask:\n${promptText}`;
    }

    // Prompt argument
    args.push(finalPrompt);

    return { cmd: binary, args };
  }

  /**
   * Executes a prompt using `codex exec` and returns a structured CodexResponse.
   */
  public async completion(
    prompt: string | Message[],
    options: CodexCompletionOptions = {},
  ): Promise<CodexResponse> {
    const { promptText, extractedSystemPrompt } = this.formatPrompt(prompt, options.systemPrompt);
    const { cmd, args } = this.buildCommand(promptText, options, extractedSystemPrompt);

    const startTime = Date.now();
    const env = this.buildEnv();
    const cwd = this.cwd || process.cwd();

    return new Promise((resolve, reject) => {
      const child = spawn(cmd, args, {
        cwd,
        env,
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
        }, options.timeoutMs);
      }

      child.stdout.on('data', (chunk) => {
        stdout += chunk.toString();
      });

      child.stderr.on('data', (chunk) => {
        stderr += chunk.toString();
      });

      child.on('error', (err) => {
        if (timer) clearTimeout(timer);
        reject(
          new CodexExecutionError(`Failed to spawn codex process: ${err.message}`, {
            stderr,
          }),
        );
      });

      child.on('close', (code) => {
        if (timer) clearTimeout(timer);
        const durationMs = Date.now() - startTime;

        if (timedOut) {
          reject(
            new CodexExecutionError(`Codex execution timed out after ${options.timeoutMs}ms`, {
              returncode: code ?? undefined,
              stdout,
              stderr,
            }),
          );
          return;
        }

        if (code !== 0 && code !== null) {
          this.handleExecutionError(code, stdout, stderr);
        }

        const parsedResult = this.parseOutput(stdout, durationMs);
        resolve(parsedResult);
      });
    });
  }

  /**
   * Streams responses line-by-line from `codex exec --json`.
   */
  public async *completionStream(
    prompt: string | Message[],
    options: CodexCompletionOptions = {},
  ): AsyncIterable<CodexStreamChunk> {
    const { promptText, extractedSystemPrompt } = this.formatPrompt(prompt, options.systemPrompt);
    const { cmd, args } = this.buildCommand(promptText, options, extractedSystemPrompt);

    // Insert --json for streaming events
    if (!args.includes('--json')) {
      args.splice(1, 0, '--json');
    }

    const env = this.buildEnv();
    const cwd = this.cwd || process.cwd();

    const child = spawn(cmd, args, {
      cwd,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stderr = '';
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    let fullText = '';
    let finalUsage: UsageInfo | undefined;
    let sessionId: string | undefined;

    const rl = readline.createInterface({
      input: child.stdout,
      crlfDelay: Infinity,
    });

    let childError: Error | undefined;
    child.on('error', (err) => {
      childError = err;
    });

    for await (const line of rl) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      try {
        const event = JSON.parse(trimmed) as Record<string, unknown>;

        if (event.session_id && typeof event.session_id === 'string') {
          sessionId = event.session_id;
        }

        // Handle text delta events from JSONL
        const deltaText = this.extractDeltaFromEvent(event);
        if (deltaText) {
          fullText += deltaText;
          yield {
            type: 'delta',
            text: deltaText,
            sessionId,
            raw: event,
          };
        }

        // Extract usage stats from completion turns if present
        if (event.type === 'turn.completed' || event.type === 'turn_completed') {
          finalUsage = this.extractUsageFromEvent(event);
        }
      } catch {
        // Line might be raw text output instead of JSON
        fullText += line;
        yield {
          type: 'delta',
          text: line,
          sessionId,
        };
      }
    }

    const exitCode = await new Promise<number | null>((resolve) => {
      child.on('close', (code) => resolve(code));
    });

    if (childError) {
      throw new CodexExecutionError(`Failed to stream codex process: ${childError.message}`, {
        stderr,
      });
    }

    if (exitCode !== 0 && exitCode !== null) {
      this.handleExecutionError(exitCode, fullText, stderr);
    }

    if (!finalUsage) {
      finalUsage = this.estimateUsage(promptText, fullText);
    }

    yield {
      type: 'final',
      text: fullText,
      usage: finalUsage,
      sessionId,
    };
  }

  private extractDeltaFromEvent(event: Record<string, unknown>): string {
    // Check common JSONL event structures in Codex CLI
    if (typeof event.delta === 'string') return event.delta;
    if (event.delta && typeof (event.delta as Record<string, unknown>).text === 'string') {
      return (event.delta as Record<string, unknown>).text as string;
    }
    if (typeof event.content === 'string') return event.content;
    if (typeof event.text === 'string') return event.text;

    if (event.item && typeof event.item === 'object') {
      const item = event.item as Record<string, unknown>;
      if (item.type === 'agent_message' || item.type === 'message') {
        if (typeof item.text === 'string') return item.text;
        if (typeof item.content === 'string') return item.content;
      }
    }

    return '';
  }

  private extractUsageFromEvent(event: Record<string, unknown>): UsageInfo {
    const usageObj = (event.usage || event.token_usage || {}) as Record<string, unknown>;
    const inputTokens = Number(usageObj.input_tokens || usageObj.prompt_tokens || 0);
    const outputTokens = Number(usageObj.output_tokens || usageObj.completion_tokens || 0);
    const totalTokens = Number(usageObj.total_tokens || inputTokens + outputTokens);
    const totalCostUsd = Number(usageObj.cost_usd || 0);

    return {
      inputTokens,
      outputTokens,
      totalTokens,
      totalCostUsd,
    };
  }

  private parseOutput(stdout: string, durationMs: number): CodexResponse {
    const trimmed = stdout.trim();

    // Check if stdout contains JSONL events
    const lines = trimmed.split('\n').filter((l) => l.trim().length > 0);
    let content = trimmed;
    let usage: UsageInfo | undefined;
    let sessionId: string | undefined;

    const firstLine = lines[0];
    const lastLine = lines[lines.length - 1];
    if (
      lines.length > 1 &&
      firstLine &&
      lastLine &&
      firstLine.startsWith('{') &&
      lastLine.endsWith('}')
    ) {
      let extractedText = '';
      for (const line of lines) {
        try {
          const event = JSON.parse(line) as Record<string, unknown>;
          if (event.session_id && typeof event.session_id === 'string') {
            sessionId = event.session_id;
          }
          const delta = this.extractDeltaFromEvent(event);
          if (delta) extractedText += delta;
          if (event.type === 'turn.completed' || event.type === 'turn_completed') {
            usage = this.extractUsageFromEvent(event);
          }
        } catch {
          // not JSON line
        }
      }
      if (extractedText) {
        content = extractedText;
      }
    } else if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
      try {
        const parsed = JSON.parse(trimmed) as Record<string, unknown>;
        if (typeof parsed.result === 'string') {
          content = parsed.result;
        } else if (typeof parsed.content === 'string') {
          content = parsed.content;
        } else if (typeof parsed.text === 'string') {
          content = parsed.text;
        }
      } catch {
        // retain content as trimmed string
      }
    }

    if (!usage) {
      usage = this.estimateUsage('', content);
    }

    return {
      content,
      sessionId,
      durationMs,
      usage,
    };
  }

  private estimateUsage(promptText: string, contentText: string): UsageInfo {
    const inputTokens = Math.max(1, Math.ceil(promptText.length / 4));
    const outputTokens = Math.max(1, Math.ceil(contentText.length / 4));
    return {
      inputTokens,
      outputTokens,
      totalTokens: inputTokens + outputTokens,
      totalCostUsd: 0,
    };
  }

  private handleExecutionError(code: number, stdout: string, stderr: string): never {
    const combinedOutput = `${stdout}\n${stderr}`.toLowerCase();

    if (
      combinedOutput.includes('unauthorized') ||
      combinedOutput.includes('401') ||
      combinedOutput.includes('authentication') ||
      combinedOutput.includes('not logged in') ||
      combinedOutput.includes('login required')
    ) {
      throw new CodexAuthError(
        `Codex authentication failed. Run 'codex login' or set OPENAI_API_KEY.\n${stderr}`,
      );
    }

    if (
      combinedOutput.includes('rate limit') ||
      combinedOutput.includes('429') ||
      combinedOutput.includes('quota exceeded') ||
      combinedOutput.includes('too many requests')
    ) {
      throw new CodexRateLimitError(`Codex rate limit or quota exceeded.\n${stderr}`);
    }

    throw new CodexExecutionError(`Codex CLI exited with code ${code}`, {
      returncode: code,
      stdout,
      stderr,
    });
  }
}
