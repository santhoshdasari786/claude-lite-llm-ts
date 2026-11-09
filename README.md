# @santhoshdasari/claude-lite-llm-ts

[![CI](https://github.com/santhoshdasari786/claude-lite-llm-ts/actions/workflows/ci.yaml/badge.svg)](https://github.com/santhoshdasari786/claude-lite-llm-ts/actions/workflows/ci.yaml)
[![npm version](https://img.shields.io/npm/v/@santhoshdasari/claude-lite-llm-ts.svg)](https://www.npmjs.com/package/@santhoshdasari/claude-lite-llm-ts)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
![Node Version](https://img.shields.io/node/v/@santhoshdasari/claude-lite-llm-ts)

A lightweight TypeScript toolkit wrapping **Anthropic Claude Code CLI** (`claude`) and **OpenAI Codex CLI** (`codex`), allowing developers to run Claude and Codex LLMs programmatically using their active **Claude Pro/Team/Max** or **ChatGPT Plus/Pro** subscriptions — bypassing pay-per-token API fees.

Includes **`ClaudeSubscriptionProvider`** and **`CodexSubscriptionProvider`** adapters, a unified **`litellm`** compatibility manager for registering custom providers in LLM pipelines, real-time token streaming, OpenAI function calling / tools support, and a local OpenAI-compatible HTTP proxy server.

---

## Features

- 🎟️ **Subscription-Powered Execution**: Authenticate using your Claude subscription token (`CLAUDE_CODE_TOKEN`) or OpenAI Codex session / API key (`OPENAI_API_KEY` / `CODEX_API_KEY` / `codex login`).
- 🤖 **Dual Provider Support**: Seamlessly call both Claude models (`sonnet`, `opus`, `haiku`) and Codex models (`o3-mini`, `gpt-4o`, `o1`).
- 🔌 **LiteLLM Custom Provider**: Export and register `ClaudeSubscriptionProvider` and `CodexSubscriptionProvider` via `litellm.custom_provider_map = [...]`.
- 🌊 **Real-Time Token Streaming**: Native line-by-line token streaming via `stream: true`, `completionStream()`, or `codexCompletionStream()`.
- 🛠️ **OpenAI Tool / Function Calling**: Support for OpenAI-format `tools` returning structured `tool_calls` with `finish_reason: "tool_calls"`.
- ⚡ **OpenAI / LiteLLM Response Parity**: Returns OpenAI-compatible `ModelResponse` with `choices`, `role`, and token `usage` metrics.
- 💬 **Flexible Prompt Formats**: Pass raw prompt strings or conversational message arrays (`[{ role: 'user', content: '...' }]`).
- 🛡️ **Safe LLM Execution**: Disables built-in CLI tool execution by default (`--tools ""` for Claude, `--sandbox read-only --ephemeral` for Codex) for pure text completions.
- 🌐 **Built-in OpenAI-Compatible HTTP Proxy**: Run a local HTTP server (`/v1/chat/completions` with SSE streaming, `/v1/models`) supporting both Claude and Codex models to integrate with any OpenAI client, LangChain, or LiteLLM proxy.
- 📊 **Session Usage & Rate Limit Monitoring**: Track session token consumption (input, output, cache read/write), estimated cost, and context window headroom (% used) like Codex CLI (`/status`, `/usage`, `/statusline`) and Claude CLI.
- 🚦 **Wrapper Action Policies & Cooldowns**: Set usage policies (budget limits, request caps, token ceilings) to enforce limits before execution, triggering automatic alerts, compacting, or failovers.
- 🔒 **Security First**: Automatically masks authentication credentials (`sk-***xxxx`) in logs/statuslines, sanitizes inputs, and resiliently reads persistent CLI stats without leaking secrets.
- 📦 **Dual ESM & CommonJS**: Full TypeScript types, tree-shaking support, and dual module builds.

---

## Installation

```bash
# npm
npm install @santhoshdasari/claude-lite-llm-ts

# pnpm
pnpm add @santhoshdasari/claude-lite-llm-ts

# bun
bun add @santhoshdasari/claude-lite-llm-ts
```

### CLI Prerequisites

Install either or both CLI tools depending on your needs:

#### 1. Anthropic Claude Code CLI

```bash
npm install -g @anthropic-ai/claude-code
claude setup-token # or export CLAUDE_CODE_TOKEN=sk-ant-oat01-...
```

#### 2. OpenAI Codex CLI

```bash
npm install -g @openai/codex
# or on macOS: brew install --cask codex
codex login # or export OPENAI_API_KEY=sk-...
```

---

## Usage Guide

### 1. Register with LiteLLM Custom Provider (Claude & Codex)

```typescript
import {
  litellm,
  ClaudeSubscriptionProvider,
  CodexSubscriptionProvider,
} from '@santhoshdasari/claude-lite-llm-ts';

// 1. Register custom providers
const claude_provider = new ClaudeSubscriptionProvider();
const codex_provider = new CodexSubscriptionProvider();

litellm.custom_provider_map = [
  { provider: 'claude_sub', custom_handler: claude_provider },
  { provider: 'codex_sub', custom_handler: codex_provider },
];

// 2. Call Claude via LiteLLM
const claudeResponse = await litellm.completion({
  model: 'claude_sub/sonnet',
  messages: [{ role: 'user', content: 'Explain event loops in Node.js in 2 sentences.' }],
});
console.log(claudeResponse.choices[0].message.content);

// 3. Call Codex via LiteLLM
const codexResponse = await litellm.completion({
  model: 'codex_sub/o3-mini',
  messages: [{ role: 'user', content: 'Write a binary search algorithm in TypeScript.' }],
});
console.log(codexResponse.choices[0].message.content);
```

---

### 2. Real-Time Token Streaming 🌊

#### Via `litellm.completion({ stream: true })`

```typescript
import { litellm, CodexSubscriptionProvider } from '@santhoshdasari/claude-lite-llm-ts';

litellm.custom_provider_map = [
  { provider: 'codex_sub', custom_handler: new CodexSubscriptionProvider() },
];

const stream = await litellm.completion({
  model: 'codex_sub/o3-mini',
  messages: [{ role: 'user', content: 'Count from 1 to 5 slowly.' }],
  stream: true,
});

for await (const chunk of stream) {
  const token = chunk.choices[0]?.delta?.content;
  if (token) process.stdout.write(token);
}
```

#### Via direct `completionStream()` or `codexCompletionStream()`

```typescript
import { completionStream, codexCompletionStream } from '@santhoshdasari/claude-lite-llm-ts';

// Stream from Claude
for await (const chunk of completionStream('Write a short haiku about coding.')) {
  if (chunk.type === 'delta') process.stdout.write(chunk.text);
}

// Stream from Codex
for await (const chunk of codexCompletionStream('Write a short haiku about TypeScript.')) {
  if (chunk.type === 'delta') process.stdout.write(chunk.text);
}
```

---

### 3. OpenAI Tools & Function Calling 🛠️

Pass standard OpenAI-compatible tool definitions. The provider prompts the model and returns standard `tool_calls`:

```typescript
import { litellm, CodexSubscriptionProvider } from '@santhoshdasari/claude-lite-llm-ts';

litellm.custom_provider_map = [
  { provider: 'codex_sub', custom_handler: new CodexSubscriptionProvider() },
];

const response = await litellm.completion({
  model: 'codex_sub/o3-mini',
  messages: [{ role: 'user', content: 'What is the weather in Tokyo right now?' }],
  tools: [
    {
      type: 'function',
      function: {
        name: 'get_current_weather',
        description: 'Get current weather in a location',
        parameters: {
          type: 'object',
          properties: {
            location: { type: 'string', description: 'The city, e.g. Tokyo' },
            unit: { type: 'string', enum: ['celsius', 'fahrenheit'] },
          },
          required: ['location'],
        },
      },
    },
  ],
});

if (response.choices[0].finish_reason === 'tool_calls') {
  const toolCall = response.choices[0].message.tool_calls[0];
  console.log('Function Name:', toolCall.function.name);
  console.log('Arguments:', JSON.parse(toolCall.function.arguments));
}
```

---

### 4. Direct Convenience Functions (`completion` & `codexCompletion`)

```typescript
import { completion, codexCompletion } from '@santhoshdasari/claude-lite-llm-ts';

// Claude
const claudeRes = await completion('Explain quantum computing in 2 sentences.', {
  model: 'sonnet',
});
console.log(claudeRes.content);

// Codex
const codexRes = await codexCompletion('Explain Dijkstra algorithm in 2 sentences.', {
  model: 'o3-mini',
});
console.log(codexRes.content);
```

---

### 5. Run as Local OpenAI Proxy Server (Supporting Claude & Codex)

Start the proxy server via CLI:

```bash
npx claude-lite-llm-ts serve --port 4000
```

Or programmatically:

```typescript
import { serveProxy } from '@santhoshdasari/claude-lite-llm-ts';

const { url } = await serveProxy({ port: 4000 });
console.log(`OpenAI proxy server running at ${url}`);
```

Configure any OpenAI SDK (Python, TS, Curl):

```python
from openai import OpenAI

client = OpenAI(base_url="http://localhost:4000/v1", api_key="none")

# Call Claude
res_claude = client.chat.completions.create(
    model="claude_sub/sonnet",
    messages=[{"role": "user", "content": "Hello Claude!"}],
)

# Call Codex
res_codex = client.chat.completions.create(
    model="codex_sub/o3-mini",
    messages=[{"role": "user", "content": "Hello Codex!"}],
)
```

---

### 6. Checking Session Usage, Limits & Statusline (Codex & Claude)

Track session tokens, monitor context window utilization, and format CLI statuslines:

#### Programmatic Usage in Your Library / App:

```typescript
import {
  createClient,
  createCodexClient,
  getSessionUsage,
  getUsageLimits,
  checkUsageLimit,
  getStatusLine,
} from '@santhoshdasari/claude-lite-llm-ts';

// 1. Get usage summary for current session
const session = getSessionUsage('my-session-id', 'claude');
console.log(`Tokens used: ${session.totalTokens}, Cost: $${session.totalCostUsd}`);

// 2. Check context window limits & headroom
const limits = getUsageLimits('my-session-id', 'claude-3-7-sonnet');
console.log(
  `Context used: ${limits.contextWindowPercent}% (${limits.contextWindowRemainingTokens} tokens left)`,
);
console.log(`Status: ${limits.status}`); // 'ok' | 'warning' | 'limit_exceeded' | 'rate_limited'

// 3. Statusline string (matches Codex / Claude CLI statusline)
const statusline = getStatusLine({ sessionId: 'my-session-id', provider: 'claude' });
console.log(statusline);
// Output: [claude-3-7-sonnet] 14.2k tokens ($0.042) | Context: 7.1% (14.2k/200.0k) | Status: OK

// 4. Enforce limit policies in LLM Lite wrapper before executing:
const check = checkUsageLimit('my-session-id', 'claude-3-7-sonnet', {
  maxCostUsd: 5.0,
  warningThresholdPercent: 80,
  maxSessionTokens: 150_000,
});

if (!check.allowed) {
  console.warn(`Action required: ${check.reason}`);
  // Execute actions: compact conversation, fallback to cheaper model, or prompt user
}
```

#### Via Proxy Server Endpoints:

- `GET /v1/usage?provider=claude&sessionId=...`: returns full JSON usage and context limit calculations.
- `GET /v1/status`: returns environment, CLI version, and authentication diagnostics (with masked credentials).
- `GET /v1/statusline?provider=claude`: returns concise statusline text (or JSON with `Accept: application/json`).

---

## Error Handling

```typescript
import {
  completion,
  codexCompletion,
  ClaudeRateLimitError,
  ClaudeAuthError,
  CodexAuthError,
  CodexRateLimitError,
} from '@santhoshdasari/claude-lite-llm-ts';

try {
  const res = await codexCompletion('Hello Codex!');
  console.log(res.content);
} catch (err) {
  if (err instanceof CodexRateLimitError) {
    console.error('OpenAI/Codex quota reached:', err.message);
  } else if (err instanceof CodexAuthError) {
    console.error('Codex authentication failure:', err.message);
  }
}
```

---

## CLI Usage

```bash
# Claude prompt
npx claude-lite-llm-ts "What is TypeScript?"

# Codex prompt
npx claude-lite-llm-ts --provider codex --model o3-mini "Write a binary search in Go"

# Show diagnostics & CLI/auth status (/status)
npx claude-lite-llm-ts status
npx claude-lite-llm-ts status --provider codex --json

# Show session token usage & context headroom (/usage)
npx claude-lite-llm-ts usage
npx claude-lite-llm-ts usage --provider codex

# Display one-line statusbar (/statusline)
npx claude-lite-llm-ts statusline
npx claude-lite-llm-ts /statusline

# Start proxy server
npx claude-lite-llm-ts serve --port 4000
```

---

## Testing

```bash
# Run unit & integration tests
npm test

# Run tests with coverage
npm run test:coverage
```

---

## License

[MIT](LICENSE) © 2026 D S Santhosh
