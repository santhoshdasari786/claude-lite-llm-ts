/**
 * Usage tracker for session-based token consumption, context window monitoring, and rate limits.
 */

import type {
  ModelLimitSpec,
  RecordUsageParams,
  SessionUsage,
  StatusLineOptions,
  UsageLimitCheckResult,
  UsageLimitPolicy,
  UsageLimits,
  UsageLimitStatus,
  UsageProviderType,
} from './usage-types.js';

/**
 * Standard model specs for context windows and maximum output tokens.
 */
export const KNOWN_MODEL_LIMITS: Record<string, ModelLimitSpec> = {
  // Claude models
  'claude-3-7-sonnet': { contextWindow: 200_000, maxOutputTokens: 64_000 },
  'claude-3-7-sonnet-latest': { contextWindow: 200_000, maxOutputTokens: 64_000 },
  'claude-3-5-sonnet': { contextWindow: 200_000, maxOutputTokens: 8_192 },
  'claude-3-5-sonnet-latest': { contextWindow: 200_000, maxOutputTokens: 8_192 },
  'claude-3-5-haiku': { contextWindow: 200_000, maxOutputTokens: 8_192 },
  'claude-3-5-haiku-latest': { contextWindow: 200_000, maxOutputTokens: 8_192 },
  'claude-3-opus': { contextWindow: 200_000, maxOutputTokens: 4_096 },
  'claude-3-opus-latest': { contextWindow: 200_000, maxOutputTokens: 4_096 },
  sonnet: { contextWindow: 200_000, maxOutputTokens: 8_192 },
  haiku: { contextWindow: 200_000, maxOutputTokens: 8_192 },
  opus: { contextWindow: 200_000, maxOutputTokens: 4_096 },

  // Codex / OpenAI models
  'o3-mini': { contextWindow: 200_000, maxOutputTokens: 100_000 },
  o1: { contextWindow: 200_000, maxOutputTokens: 100_000 },
  'o1-mini': { contextWindow: 128_000, maxOutputTokens: 65_536 },
  'o1-preview': { contextWindow: 128_000, maxOutputTokens: 32_768 },
  'gpt-4o': { contextWindow: 128_000, maxOutputTokens: 16_384 },
  'gpt-4o-mini': { contextWindow: 128_000, maxOutputTokens: 16_384 },
  'gpt-4-turbo': { contextWindow: 128_000, maxOutputTokens: 4_096 },
  codex: { contextWindow: 128_000, maxOutputTokens: 16_384 },
};

export const DEFAULT_MODEL_LIMIT: ModelLimitSpec = {
  contextWindow: 128_000,
  maxOutputTokens: 8_192,
};

/**
 * Normalizes model names for lookup against known specs.
 */
export function resolveModelLimits(model?: string): ModelLimitSpec {
  if (!model) return DEFAULT_MODEL_LIMIT;
  const normalized = model.toLowerCase().trim();

  // Direct match
  if (KNOWN_MODEL_LIMITS[normalized]) {
    return KNOWN_MODEL_LIMITS[normalized];
  }

  // Prefix matching
  for (const [key, spec] of Object.entries(KNOWN_MODEL_LIMITS)) {
    if (normalized.startsWith(key) || normalized.includes(key)) {
      return spec;
    }
  }

  return DEFAULT_MODEL_LIMIT;
}

/**
 * Format token counts with compact suffix (e.g. 1,400 -> 1.4k, 250,000 -> 250k).
 */
export function formatTokenCount(tokens: number): string {
  if (tokens >= 1_000_000) {
    return `${(tokens / 1_000_000).toFixed(1)}M`;
  }
  if (tokens >= 1_000) {
    return `${(tokens / 1_000).toFixed(1)}k`;
  }
  return tokens.toString();
}

/**
 * Manages in-memory tracking of sessions and rate limits.
 */
export class UsageTracker {
  private sessions = new Map<string, SessionUsage>();
  private defaultSessionId: string = 'default';
  private rateLimits = new Map<
    UsageProviderType,
    { resetsAt: string; retryAfterMs: number; recordedAt: number }
  >();

  constructor(defaultSessionId = 'default') {
    this.defaultSessionId = defaultSessionId;
  }

  /**
   * Records token usage and duration for a given session.
   */
  public recordUsage(params: RecordUsageParams): SessionUsage {
    const sessionId = params.sessionId || this.defaultSessionId;
    const now = new Date().toISOString();
    const existing = this.sessions.get(sessionId);

    const inputTokens = params.usage.inputTokens || 0;
    const outputTokens = params.usage.outputTokens || 0;
    const totalTokens = params.usage.totalTokens || inputTokens + outputTokens;
    const costUsd = Number(params.usage.totalCostUsd || 0);
    const duration = params.durationMs || 0;

    if (existing) {
      existing.requestCount += 1;
      existing.inputTokens += inputTokens;
      existing.outputTokens += outputTokens;
      existing.totalTokens += totalTokens;
      existing.totalCostUsd += costUsd;
      existing.durationMs += duration;
      existing.lastRequestAt = now;
      if (params.model) existing.model = params.model;
      if (params.usage.cacheReadInputTokens !== undefined) {
        existing.cacheReadInputTokens =
          (existing.cacheReadInputTokens || 0) + params.usage.cacheReadInputTokens;
      }
      if (params.usage.cacheCreationInputTokens !== undefined) {
        existing.cacheCreationInputTokens =
          (existing.cacheCreationInputTokens || 0) + params.usage.cacheCreationInputTokens;
      }
      if (params.usage.reasoningTokens !== undefined) {
        existing.reasoningTokens = (existing.reasoningTokens || 0) + params.usage.reasoningTokens;
      }
      return { ...existing };
    }

    const newUsage: SessionUsage = {
      sessionId,
      provider: params.provider,
      model: params.model || (params.provider === 'codex' ? 'o3-mini' : 'sonnet'),
      requestCount: 1,
      inputTokens,
      outputTokens,
      totalTokens,
      cacheReadInputTokens: params.usage.cacheReadInputTokens,
      cacheCreationInputTokens: params.usage.cacheCreationInputTokens,
      reasoningTokens: params.usage.reasoningTokens,
      totalCostUsd: costUsd,
      startedAt: now,
      lastRequestAt: now,
      durationMs: duration,
    };

    this.sessions.set(sessionId, newUsage);
    return { ...newUsage };
  }

  /**
   * Records a rate-limit event for a provider with optional cooldown duration.
   */
  public recordRateLimit(
    provider: UsageProviderType,
    retryAfterMs = 60_000,
    resetsAt?: string,
  ): void {
    const now = Date.now();
    const effectiveResetsAt = resetsAt || new Date(now + retryAfterMs).toISOString();
    this.rateLimits.set(provider, {
      resetsAt: effectiveResetsAt,
      retryAfterMs,
      recordedAt: now,
    });
  }

  /**
   * Retrieves active rate limit status for a provider if in cooldown.
   */
  public getRateLimit(provider: UsageProviderType):
    | {
        resetsAt: string;
        retryAfterMs: number;
        isActive: boolean;
      }
    | undefined {
    const entry = this.rateLimits.get(provider);
    if (!entry) return undefined;
    const now = Date.now();
    const remainingMs = Math.max(0, new Date(entry.resetsAt).getTime() - now);
    const isActive = remainingMs > 0;
    return {
      resetsAt: entry.resetsAt,
      retryAfterMs: remainingMs,
      isActive,
    };
  }

  /**
   * Clears rate limit cooldown for a provider.
   */
  public clearRateLimit(provider: UsageProviderType): void {
    this.rateLimits.delete(provider);
  }

  /**
   * Retrieves usage for a specific session or the default session.
   */
  public getSession(sessionId?: string): SessionUsage | undefined {
    const id = sessionId || this.defaultSessionId;
    const item = this.sessions.get(id);
    return item ? { ...item } : undefined;
  }

  /**
   * Retrieves or initializes usage for a specific session.
   */
  public getOrCreateSession(
    sessionId?: string,
    provider: UsageProviderType = 'claude',
    model?: string,
  ): SessionUsage {
    const id = sessionId || this.defaultSessionId;
    let item = this.sessions.get(id);
    if (!item) {
      const now = new Date().toISOString();
      item = {
        sessionId: id,
        provider,
        model: model || (provider === 'codex' ? 'o3-mini' : 'sonnet'),
        requestCount: 0,
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        totalCostUsd: 0,
        startedAt: now,
        lastRequestAt: now,
        durationMs: 0,
      };
      this.sessions.set(id, item);
    }
    return { ...item };
  }

  /**
   * Lists all tracked sessions.
   */
  public getAllSessions(): SessionUsage[] {
    return Array.from(this.sessions.values()).map((s) => ({ ...s }));
  }

  /**
   * Calculates limits, context window percentage, and warning flags for a session.
   */
  public calculateLimits(
    usage: SessionUsage,
    modelOverride?: string,
    policy?: UsageLimitPolicy,
  ): UsageLimits {
    const effectiveModel = modelOverride || usage.model;
    const spec = resolveModelLimits(effectiveModel);
    const contextWindow = policy?.maxSessionTokens || spec.contextWindow;
    const maxOutputTokens = spec.maxOutputTokens;

    const usedTokens = usage.totalTokens;
    const remainingTokens = Math.max(0, contextWindow - usedTokens);
    const percentUsed = contextWindow > 0 ? Math.min(100, (usedTokens / contextWindow) * 100) : 0.0;

    const warningThreshold = policy?.warningThresholdPercent ?? 80;

    let status: UsageLimitStatus = 'ok';
    const rateLimitInfo = this.getRateLimit(usage.provider);
    if (rateLimitInfo?.isActive) {
      status = 'rate_limited';
    } else if (
      usedTokens >= contextWindow ||
      (policy?.maxCostUsd !== undefined && usage.totalCostUsd >= policy.maxCostUsd) ||
      (policy?.maxRequestsPerSession !== undefined &&
        usage.requestCount >= policy.maxRequestsPerSession)
    ) {
      status = 'limit_exceeded';
    } else if (percentUsed >= warningThreshold) {
      status = 'warning';
    }

    const isApproachingLimit = status === 'warning' || percentUsed >= warningThreshold;
    const isLimitExceeded = status === 'limit_exceeded';

    return {
      contextWindow,
      maxOutputTokens,
      contextWindowUsedTokens: usedTokens,
      contextWindowRemainingTokens: remainingTokens,
      contextWindowPercent: Number(percentUsed.toFixed(2)),
      status,
      isApproachingLimit,
      isLimitExceeded,
      resetsAt: rateLimitInfo?.isActive ? rateLimitInfo.resetsAt : undefined,
      retryAfterMs: rateLimitInfo?.isActive ? rateLimitInfo.retryAfterMs : undefined,
    };
  }

  /**
   * Checks whether a session exceeds limits according to policy.
   * Useful for LLM lite wrappers to execute actions (compact context, fallback model, abort).
   */
  public checkLimit(
    sessionId?: string,
    modelOverride?: string,
    policy?: UsageLimitPolicy,
  ): UsageLimitCheckResult {
    const session = this.getOrCreateSession(sessionId);
    const limits = this.calculateLimits(session, modelOverride, policy);

    let allowed = true;
    let reason: string | undefined;

    if (limits.status === 'rate_limited') {
      allowed = false;
      reason = `Provider '${session.provider}' is rate limited. Cooldown resets at ${limits.resetsAt || 'soon'}.`;
    } else if (limits.status === 'limit_exceeded') {
      allowed = false;
      if (policy?.maxCostUsd !== undefined && session.totalCostUsd >= policy.maxCostUsd) {
        reason = `Session cost limit exceeded: $${session.totalCostUsd.toFixed(4)} >= $${policy.maxCostUsd.toFixed(4)}.`;
      } else if (
        policy?.maxRequestsPerSession !== undefined &&
        session.requestCount >= policy.maxRequestsPerSession
      ) {
        reason = `Session request limit exceeded: ${session.requestCount} >= ${policy.maxRequestsPerSession}.`;
      } else {
        reason = `Context window limit exceeded: ${session.totalTokens} >= ${limits.contextWindow} tokens.`;
      }
    } else if (limits.status === 'warning') {
      reason = `Approaching limit: ${limits.contextWindowPercent}% of context window used (${formatTokenCount(limits.contextWindowUsedTokens)}/${formatTokenCount(limits.contextWindow)}).`;
    }

    return {
      allowed,
      reason,
      usage: session,
      limits,
    };
  }

  /**
   * Formats a concise statusline conforming to CLI statusline conventions.
   *
   * Example outputs:
   * `[claude-3-7-sonnet] 14.2k tokens ($0.04) | Context: 7.1% (14.2k/200k) | OK`
   * `[o3-mini] 45.0k tokens | Context: 22.5% (45k/200k) | WARNING`
   */
  public formatStatusLine(sessionId?: string, options: StatusLineOptions = {}): string {
    const session = this.getOrCreateSession(
      sessionId || options.sessionId,
      options.provider || 'claude',
      options.model,
    );
    const limits = this.calculateLimits(session, options.model);

    const modelName = options.model || session.model;
    const tokensFormatted = formatTokenCount(session.totalTokens);
    const contextFormatted = `${limits.contextWindowPercent}% (${formatTokenCount(limits.contextWindowUsedTokens)}/${formatTokenCount(limits.contextWindow)})`;

    const parts: string[] = [];

    // [Model] Tokens (Cost)
    let modelTokens = `[${modelName}] ${tokensFormatted} tokens`;
    if (options.showCost !== false && session.totalCostUsd > 0) {
      modelTokens += ` ($${session.totalCostUsd.toFixed(3)})`;
    }
    parts.push(modelTokens);

    // Context window usage
    if (options.showContextPercent !== false) {
      parts.push(`Context: ${contextFormatted}`);
    }

    // Health Status
    if (options.showStatus !== false) {
      const statusLabel =
        limits.status === 'ok'
          ? 'OK'
          : limits.status === 'warning'
            ? 'WARN'
            : limits.status === 'rate_limited'
              ? 'RATE_LIMITED'
              : 'LIMIT_EXCEEDED';
      parts.push(`Status: ${statusLabel}`);
    }

    return parts.join(' | ');
  }

  /**
   * Resets usage for a specific session.
   */
  public resetSession(sessionId: string): void {
    this.sessions.delete(sessionId);
  }

  /**
   * Clears all session and rate limit tracking.
   */
  public clear(): void {
    this.sessions.clear();
    this.rateLimits.clear();
  }
}

/**
 * Global singleton usage tracker instance for application-wide tracking.
 */
export const globalUsageTracker = new UsageTracker('default');
