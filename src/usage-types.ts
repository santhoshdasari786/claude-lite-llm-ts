/**
 * Types and interfaces for session usage tracking and limits.
 *
 * Conforms to standard semantic versioning and extensible reporting structures.
 */

import type { UsageInfo } from './types.js';

export const USAGE_REPORT_VERSION = '1.0.0';

export type UsageProviderType = 'claude' | 'codex';

export type UsageLimitStatus = 'ok' | 'warning' | 'limit_exceeded' | 'rate_limited';

/**
 * Model specifications for context windows and output limits.
 */
export interface ModelLimitSpec {
  contextWindow: number;
  maxOutputTokens: number;
}

/**
 * Tracks accumulated usage for a single session.
 */
export interface SessionUsage {
  sessionId: string;
  provider: UsageProviderType;
  model: string;
  requestCount: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cacheReadInputTokens?: number;
  cacheCreationInputTokens?: number;
  reasoningTokens?: number;
  totalCostUsd: number;
  startedAt: string;
  lastRequestAt: string;
  durationMs: number;
}

/**
 * Usage limit calculations, thresholds, and health status for a session.
 */
export interface UsageLimits {
  /** Maximum context window allowed for the model */
  contextWindow: number;
  /** Max output tokens allowed for a single completion */
  maxOutputTokens?: number;
  /** Tokens consumed in the current session against the context window */
  contextWindowUsedTokens: number;
  /** Headroom remaining before reaching context window limit */
  contextWindowRemainingTokens: number;
  /** Percentage of context window used (0 - 100) */
  contextWindowPercent: number;
  /** Health status of usage: ok, warning (approaching limit), limit_exceeded, rate_limited */
  status: UsageLimitStatus;
  /** True when usage reaches or exceeds warningThresholdPercent */
  isApproachingLimit: boolean;
  /** True when usage reaches or exceeds 100% of context window or custom max tokens */
  isLimitExceeded: boolean;
  /** Optional timestamp when rate limit cooldown resets (ISO string) */
  resetsAt?: string;
  /** Milliseconds remaining until cooldown resets */
  retryAfterMs?: number;
}

/**
 * Policy rules to enforce usage limits in LLM wrappers.
 */
export interface UsageLimitPolicy {
  /** Percentage threshold to mark status as 'warning' (default 80%) */
  warningThresholdPercent?: number;
  /** Maximum total tokens allowed in a session before triggering limit */
  maxSessionTokens?: number;
  /** Maximum cumulative cost in USD allowed in a session */
  maxCostUsd?: number;
  /** Maximum number of requests allowed in a session */
  maxRequestsPerSession?: number;
  /** Action to take when a limit is exceeded */
  onLimitExceeded?: 'warn' | 'throw' | 'block';
}

/**
 * Result returned by limit check operations.
 */
export interface UsageLimitCheckResult {
  /** Whether the request is permitted under current policy */
  allowed: boolean;
  /** Reason for rejection or warning if applicable */
  reason?: string;
  /** Current session usage snapshot */
  usage: SessionUsage;
  /** Current limit calculations */
  limits: UsageLimits;
}

/**
 * Diagnostic and status report for CLI and environment.
 */
export interface StatusReport {
  version: string;
  timestamp: string;
  provider: UsageProviderType | 'all';
  health: 'ok' | 'degraded' | 'error';
  cliStatus: {
    installed: boolean;
    path: string;
    version?: string;
  };
  authStatus: {
    authenticated: boolean;
    tokenConfigured: boolean;
    tokenPreview?: string;
  };
  currentSession?: SessionUsage;
  limits?: UsageLimits;
  persistentStats?: Record<string, unknown>;
}

/**
 * Options for formatting statuslines.
 */
export interface StatusLineOptions {
  provider?: UsageProviderType;
  sessionId?: string;
  model?: string;
  showCost?: boolean;
  showContextPercent?: boolean;
  showStatus?: boolean;
  compact?: boolean;
}

/**
 * Parameters for recording usage into a tracker.
 */
export interface RecordUsageParams {
  sessionId?: string;
  provider: UsageProviderType;
  model?: string;
  usage: UsageInfo & {
    cacheReadInputTokens?: number;
    cacheCreationInputTokens?: number;
    reasoningTokens?: number;
  };
  durationMs?: number;
}
