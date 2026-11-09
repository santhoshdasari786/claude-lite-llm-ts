import { describe, it, expect, beforeEach } from 'vitest';
import {
  ClaudeClient,
  ClaudeRateLimitError,
  ClaudeSubscriptionProvider,
  CodexClient,
  CodexSubscriptionProvider,
  createProxyServer,
  formatTokenCount,
  getSessionUsage,
  getStatus,
  getStatusLine,
  getUsageLimits,
  checkUsageLimit,
  globalUsageTracker,
  litellm,
  maskSecret,
  readClaudePersistentStats,
  readCodexPersistentStats,
  resolveModelLimits,
  resetSessionUsage,
  clearAllUsage,
  UsageTracker,
  USAGE_REPORT_VERSION,
} from './index.js';

describe('UsageTracker and Limit Monitoring', () => {
  let tracker: UsageTracker;

  beforeEach(() => {
    tracker = new UsageTracker('test-session');
    clearAllUsage();
  });

  it('records session usage and accumulates across calls', () => {
    tracker.recordUsage({
      sessionId: 'sess-1',
      provider: 'claude',
      model: 'claude-3-7-sonnet',
      usage: {
        inputTokens: 100,
        outputTokens: 50,
        totalTokens: 150,
        totalCostUsd: 0.002,
      },
      durationMs: 1200,
    });

    const first = tracker.getSession('sess-1');
    expect(first).toBeDefined();
    expect(first?.requestCount).toBe(1);
    expect(first?.inputTokens).toBe(100);
    expect(first?.outputTokens).toBe(50);
    expect(first?.totalTokens).toBe(150);
    expect(first?.totalCostUsd).toBe(0.002);
    expect(first?.durationMs).toBe(1200);

    // Second call to the same session
    tracker.recordUsage({
      sessionId: 'sess-1',
      provider: 'claude',
      model: 'claude-3-7-sonnet',
      usage: {
        inputTokens: 200,
        outputTokens: 80,
        totalTokens: 280,
        totalCostUsd: 0.003,
      },
      durationMs: 800,
    });

    const second = tracker.getSession('sess-1');
    expect(second?.requestCount).toBe(2);
    expect(second?.inputTokens).toBe(300);
    expect(second?.outputTokens).toBe(130);
    expect(second?.totalTokens).toBe(430);
    expect(second?.totalCostUsd).toBe(0.005);
    expect(second?.durationMs).toBe(2000);
  });

  it('resolves model limits accurately', () => {
    expect(resolveModelLimits('claude-3-7-sonnet').contextWindow).toBe(200_000);
    expect(resolveModelLimits('sonnet').contextWindow).toBe(200_000);
    expect(resolveModelLimits('o3-mini').contextWindow).toBe(200_000);
    expect(resolveModelLimits('gpt-4o').contextWindow).toBe(128_000);
    expect(resolveModelLimits('unknown-model').contextWindow).toBe(128_000);
  });

  it('calculates limits, warning status, and headroom', () => {
    tracker.recordUsage({
      sessionId: 'sess-limits',
      provider: 'claude',
      model: 'sonnet',
      usage: {
        inputTokens: 150_000,
        outputTokens: 20_000,
        totalTokens: 170_000,
        totalCostUsd: 0.5,
      },
    });

    const session = tracker.getSession('sess-limits')!;
    // 170,000 / 200,000 = 85%, which is >= warning threshold (80%)
    const limits = tracker.calculateLimits(session);

    expect(limits.contextWindow).toBe(200_000);
    expect(limits.contextWindowUsedTokens).toBe(170_000);
    expect(limits.contextWindowRemainingTokens).toBe(30_000);
    expect(limits.contextWindowPercent).toBe(85);
    expect(limits.status).toBe('warning');
    expect(limits.isApproachingLimit).toBe(true);
    expect(limits.isLimitExceeded).toBe(false);
  });

  it('detects when limit is exceeded', () => {
    tracker.recordUsage({
      sessionId: 'sess-overflow',
      provider: 'codex',
      model: 'gpt-4o',
      usage: {
        inputTokens: 100_000,
        outputTokens: 35_000,
        totalTokens: 135_000,
        totalCostUsd: 1.2,
      },
    });

    const session = tracker.getSession('sess-overflow')!;
    const limits = tracker.calculateLimits(session);

    // GPT-4o context is 128,000 tokens. 135,000 > 128,000
    expect(limits.status).toBe('limit_exceeded');
    expect(limits.isLimitExceeded).toBe(true);
    expect(limits.contextWindowRemainingTokens).toBe(0);
  });

  it('enforces custom limit policy for LLM lite wrappers', () => {
    tracker.recordUsage({
      sessionId: 'sess-budget',
      provider: 'claude',
      model: 'sonnet',
      usage: {
        inputTokens: 1000,
        outputTokens: 500,
        totalTokens: 1500,
        totalCostUsd: 4.5,
      },
    });

    // Check with max cost limit of $3.00
    const check1 = tracker.checkLimit('sess-budget', 'sonnet', { maxCostUsd: 3.0 });
    expect(check1.allowed).toBe(false);
    expect(check1.reason).toContain('cost limit exceeded');

    // Check with max cost limit of $10.00
    const check2 = tracker.checkLimit('sess-budget', 'sonnet', { maxCostUsd: 10.0 });
    expect(check2.allowed).toBe(true);
  });

  it('tracks provider rate limit cooldowns', () => {
    expect(tracker.getRateLimit('claude')?.isActive).toBeFalsy();

    tracker.recordRateLimit('claude', 30_000);
    const rateLimit = tracker.getRateLimit('claude');
    expect(rateLimit?.isActive).toBe(true);
    expect(rateLimit?.retryAfterMs).toBeGreaterThan(0);

    const check = tracker.checkLimit('any-session');
    expect(check.allowed).toBe(false);
    expect(check.limits.status).toBe('rate_limited');

    tracker.clearRateLimit('claude');
    expect(tracker.getRateLimit('claude')?.isActive).toBeFalsy();
  });

  it('formats statusline matching CLI status conventions', () => {
    tracker.recordUsage({
      sessionId: 'sess-statusline',
      provider: 'claude',
      model: 'claude-3-7-sonnet',
      usage: {
        inputTokens: 14_000,
        outputTokens: 1_200,
        totalTokens: 15_200,
        totalCostUsd: 0.045,
      },
    });

    const statusline = tracker.formatStatusLine('sess-statusline');
    expect(statusline).toContain('[claude-3-7-sonnet]');
    expect(statusline).toContain('15.2k tokens');
    expect(statusline).toContain('($0.045)');
    expect(statusline).toContain('Context:');
    expect(statusline).toContain('Status: OK');
  });

  it('formats token counts with compact suffixes', () => {
    expect(formatTokenCount(500)).toBe('500');
    expect(formatTokenCount(1_500)).toBe('1.5k');
    expect(formatTokenCount(250_000)).toBe('250.0k');
    expect(formatTokenCount(2_500_000)).toBe('2.5M');
  });
});

describe('Security and Diagnostic Readers', () => {
  it('masks secret keys safely without leaking tokens', () => {
    expect(maskSecret('sk-ant-api03-1234567890abcdef')).toBe('sk-***cdef');
    expect(maskSecret('short')).toBe('***');
    expect(maskSecret('')).toBe('');
    expect(maskSecret(undefined)).toBe('');
  });

  it('safely reads persistent stats without throwing on missing files', () => {
    const claudeStats = readClaudePersistentStats();
    // Should be an object or undefined, but never throw
    expect(claudeStats === undefined || typeof claudeStats === 'object').toBe(true);

    const codexStats = readCodexPersistentStats();
    expect(codexStats === undefined || typeof codexStats === 'object').toBe(true);
  });
});

describe('Client Usage Methods and Limit Enforcement', () => {
  it('provides getUsage, getLimits, getStatus, and getStatusLine on ClaudeClient', async () => {
    const client = new ClaudeClient({
      token: 'test-secret-token',
      claudePath: process.execPath,
      defaultModel: 'claude-3-7-sonnet',
    });

    const usage = client.getUsage('test-claude-sess');
    expect(usage.sessionId).toBe('test-claude-sess');
    expect(usage.provider).toBe('claude');

    const limits = client.getLimits('test-claude-sess');
    expect(limits.contextWindow).toBe(200_000);
    expect(limits.status).toBe('ok');

    const line = client.getStatusLine('test-claude-sess');
    expect(line).toContain('[claude-3-7-sonnet]');

    const status = await client.getStatus('test-claude-sess');
    expect(status.version).toBe(USAGE_REPORT_VERSION);
    expect(status.provider).toBe('claude');
    expect(status.authStatus.authenticated).toBe(true);
    expect(status.authStatus.tokenPreview).toBe('tes***oken'); // Masked!
  });

  it('provides getUsage, getLimits, getStatus, and getStatusLine on CodexClient', async () => {
    const client = new CodexClient({
      apiKey: 'sk-proj-test123456789',
      codexPath: process.execPath,
      defaultModel: 'o3-mini',
    });

    const usage = client.getUsage('test-codex-sess');
    expect(usage.sessionId).toBe('test-codex-sess');
    expect(usage.provider).toBe('codex');

    const limits = client.getLimits('test-codex-sess');
    expect(limits.contextWindow).toBe(200_000);

    const line = client.getStatusLine('test-codex-sess');
    expect(line).toContain('[o3-mini]');

    const status = await client.getStatus('test-codex-sess');
    expect(status.version).toBe(USAGE_REPORT_VERSION);
    expect(status.provider).toBe('codex');
    expect(status.authStatus.tokenPreview).toContain('***'); // Masked!
  });

  it('throws RateLimitError when limitPolicy is exceeded with onLimitExceeded throw', async () => {
    const customTracker = new UsageTracker();
    customTracker.recordUsage({
      sessionId: 'sess-blocked',
      provider: 'claude',
      model: 'sonnet',
      usage: {
        inputTokens: 100,
        outputTokens: 50,
        totalTokens: 150,
        totalCostUsd: 0.1,
      },
    });

    const client = new ClaudeClient({
      token: 'test-token',
      claudePath: process.execPath,
      usageTracker: customTracker,
      limitPolicy: {
        maxSessionTokens: 100,
        onLimitExceeded: 'throw',
      },
    });

    await expect(client.completion('Hello', { sessionId: 'sess-blocked' })).rejects.toThrow(
      ClaudeRateLimitError,
    );
  });
});

describe('Providers and LiteLLM Integration', () => {
  it('exposes usage and status on ClaudeSubscriptionProvider', async () => {
    const provider = new ClaudeSubscriptionProvider({
      client: new ClaudeClient({
        token: 'token-123',
        claudePath: process.execPath,
      }),
    });

    expect(provider.getUsage()).toBeDefined();
    expect(provider.getLimits()).toBeDefined();
    expect(provider.getStatusLine()).toContain('Status:');

    const status = await provider.getStatus();
    expect(status.provider).toBe('claude');
  });

  it('exposes usage and status on CodexSubscriptionProvider', async () => {
    const provider = new CodexSubscriptionProvider({
      client: new CodexClient({
        apiKey: 'sk-test',
        codexPath: process.execPath,
      }),
    });

    expect(provider.getUsage()).toBeDefined();
    expect(provider.getLimits()).toBeDefined();
    expect(provider.getStatusLine()).toContain('Status:');

    const status = await provider.getStatus();
    expect(status.provider).toBe('codex');
  });

  it('exposes usage limit checking in litellm manager', () => {
    const check = litellm.checkUsageLimit({
      model: 'claude-3-7-sonnet',
      messages: [{ role: 'user', content: 'test' }],
    });
    expect(check.allowed).toBe(true);
    expect(check.limits.contextWindow).toBe(200_000);
  });

  it('exposes top-level convenience functions from core', async () => {
    const usage = getSessionUsage('core-sess', 'claude');
    expect(usage.sessionId).toBe('core-sess');

    const limits = getUsageLimits('core-sess', 'claude-3-7-sonnet');
    expect(limits.contextWindow).toBe(200_000);

    const check = checkUsageLimit('core-sess', 'claude-3-7-sonnet');
    expect(check.allowed).toBe(true);

    const statusline = getStatusLine({ sessionId: 'core-sess', provider: 'claude' });
    expect(statusline).toContain('Context:');

    const status = await getStatus('claude', 'core-sess');
    expect(status.version).toBe(USAGE_REPORT_VERSION);

    resetSessionUsage('core-sess');
    expect(globalUsageTracker.getSession('core-sess')).toBeUndefined();
  });
});

describe('HTTP Proxy Server Usage Endpoints', () => {
  it('serves /v1/usage, /v1/status, and /v1/statusline', async () => {
    const server = createProxyServer();
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const address = server.address() as { port: number };
    const port = address.port;

    try {
      // 1. GET /v1/usage
      const usageRes = await fetch(`http://localhost:${port}/v1/usage?provider=claude`);
      expect(usageRes.status).toBe(200);
      const usageJson = (await usageRes.json()) as Record<string, unknown>;
      expect(usageJson.version).toBe(USAGE_REPORT_VERSION);
      expect(usageJson.session).toBeDefined();
      expect(usageJson.limits).toBeDefined();

      // 2. GET /v1/status
      const statusRes = await fetch(`http://localhost:${port}/v1/status`);
      expect(statusRes.status).toBe(200);
      const statusJson = (await statusRes.json()) as Record<string, unknown>;
      expect(statusJson.claude).toBeDefined();
      expect(statusJson.codex).toBeDefined();

      // 3. GET /v1/statusline (plain text)
      const lineRes = await fetch(`http://localhost:${port}/v1/statusline?provider=claude`);
      expect(lineRes.status).toBe(200);
      const lineText = await lineRes.text();
      expect(lineText).toContain('Context:');

      // 4. GET /v1/statusline (JSON)
      const lineJsonRes = await fetch(`http://localhost:${port}/v1/statusline?provider=claude`, {
        headers: { Accept: 'application/json' },
      });
      expect(lineJsonRes.status).toBe(200);
      const lineJson = (await lineJsonRes.json()) as Record<string, unknown>;
      expect(lineJson.statusline).toBeDefined();
      expect(lineJson.limits).toBeDefined();
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
