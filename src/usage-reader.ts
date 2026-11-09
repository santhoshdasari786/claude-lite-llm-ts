/**
 * System reader for persistent CLI usage stats and diagnostic status.
 *
 * Enforces strict security best practices:
 * - Credentials and API keys are masked.
 * - Path traversal protections.
 * - Non-throwing resilient disk reads.
 */

import { execSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { ClaudeClient } from './client.js';
import type { CodexClient } from './codex-client.js';
import { globalUsageTracker, UsageTracker } from './usage-tracker.js';
import { type StatusReport, USAGE_REPORT_VERSION, type UsageProviderType } from './usage-types.js';

/**
 * Safely masks secret tokens or API keys to prevent accidental leaks in logs or UI.
 *
 * Examples:
 * - "sk-ant-api03-abcdefghijkl" -> "sk-***ijkl"
 * - "short" -> "***"
 */
export function maskSecret(secret?: string): string {
  if (!secret) return '';
  const trimmed = secret.trim();
  if (trimmed.length <= 8) {
    return '***';
  }
  const prefix = trimmed.slice(0, 3);
  const suffix = trimmed.slice(-4);
  return `${prefix}***${suffix}`;
}

/**
 * Validates session IDs to prevent path traversal or injection.
 */
export function sanitizeSessionId(sessionId: string): string {
  return sessionId.replace(/[^a-zA-Z0-9_\-.]/g, '_');
}

/**
 * Safely reads JSON from disk without throwing.
 */
function safeReadJson<T>(filePath: string): T | undefined {
  try {
    if (!fs.existsSync(filePath)) return undefined;
    const content = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(content) as T;
  } catch {
    return undefined;
  }
}

/**
 * Reads persistent usage statistics recorded by Claude Code CLI (~/.claude/stats-cache.json).
 */
export function readClaudePersistentStats(): Record<string, unknown> | undefined {
  const home = os.homedir();
  const statsPath = path.join(home, '.claude', 'stats-cache.json');
  const data = safeReadJson<{
    version?: number;
    lastComputedDate?: string;
    totalSessions?: number;
    totalMessages?: number;
    dailyModelTokens?: Array<{ date: string; tokensByModel: Record<string, number> }>;
    modelUsage?: Record<string, unknown>;
  }>(statsPath);

  if (!data) return undefined;

  return {
    source: '~/.claude/stats-cache.json',
    totalSessions: data.totalSessions,
    totalMessages: data.totalMessages,
    lastComputedDate: data.lastComputedDate,
    modelUsage: data.modelUsage,
  };
}

/**
 * Reads persistent metadata recorded by Codex CLI (~/.codex/models_cache.json).
 */
export function readCodexPersistentStats(): Record<string, unknown> | undefined {
  const home = os.homedir();
  const modelsPath = path.join(home, '.codex', 'models_cache.json');
  const data = safeReadJson<unknown>(modelsPath);

  if (!data) return undefined;

  return {
    source: '~/.codex/models_cache.json',
    modelsCacheAvailable: true,
  };
}

/**
 * Queries CLI version string safely with a short timeout.
 */
export function queryCliVersion(executablePath: string): string | undefined {
  try {
    if (!executablePath || !fs.existsSync(executablePath)) return undefined;
    const output = execSync(`"${executablePath}" --version`, {
      encoding: 'utf8',
      timeout: 3000,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return output.trim();
  } catch {
    return undefined;
  }
}

/**
 * Compiles a comprehensive StatusReport for the given provider and session.
 */
export async function getProviderStatus(options: {
  provider: UsageProviderType;
  client?: ClaudeClient | CodexClient;
  usageTracker?: UsageTracker;
  sessionId?: string;
}): Promise<StatusReport> {
  const tracker = options.usageTracker || globalUsageTracker;
  const provider = options.provider;
  const session = tracker.getOrCreateSession(options.sessionId, provider);
  const limits = tracker.calculateLimits(session);

  let binaryPath = '';
  let tokenConfigured = false;
  let tokenPreview: string | undefined;

  if (provider === 'claude') {
    const claudeClient = options.client as ClaudeClient | undefined;
    binaryPath = claudeClient?.claudePath || '';
    if (!binaryPath) {
      try {
        const { ClaudeClient } = await import('./client.js');
        const c = new ClaudeClient();
        binaryPath = c.claudePath;
        tokenConfigured = Boolean(c.token);
        tokenPreview = maskSecret(c.token);
      } catch {
        binaryPath = '';
      }
    } else {
      tokenConfigured = Boolean(claudeClient?.token);
      tokenPreview = maskSecret(claudeClient?.token);
    }
  } else {
    const codexClient = options.client as CodexClient | undefined;
    binaryPath = codexClient?.codexPath || '';
    if (!binaryPath) {
      try {
        const { CodexClient } = await import('./codex-client.js');
        const c = new CodexClient();
        binaryPath = c.codexPath;
        tokenConfigured = Boolean(c.apiKey);
        tokenPreview = maskSecret(c.apiKey);
      } catch {
        binaryPath = '';
      }
    } else {
      tokenConfigured = Boolean(codexClient?.apiKey);
      tokenPreview = maskSecret(codexClient?.apiKey);
    }
  }

  const isInstalled = Boolean(binaryPath && fs.existsSync(binaryPath));
  const version = isInstalled ? queryCliVersion(binaryPath) : undefined;

  const persistentStats =
    provider === 'claude' ? readClaudePersistentStats() : readCodexPersistentStats();

  let health: 'ok' | 'degraded' | 'error' = 'ok';
  if (!isInstalled) {
    health = 'error';
  } else if (limits.status === 'rate_limited' || limits.status === 'limit_exceeded') {
    health = 'degraded';
  }

  return {
    version: USAGE_REPORT_VERSION,
    timestamp: new Date().toISOString(),
    provider,
    health,
    cliStatus: {
      installed: isInstalled,
      path: binaryPath,
      version,
    },
    authStatus: {
      authenticated: tokenConfigured,
      tokenConfigured,
      tokenPreview,
    },
    currentSession: session,
    limits,
    persistentStats,
  };
}
