# @santhoshdasari/claude-lite-llm-ts

[![CI](https://github.com/santhoshdasari786/claude-lite-llm-ts/actions/workflows/ci.yaml/badge.svg)](https://github.com/santhoshdasari786/claude-lite-llm-ts/actions/workflows/ci.yaml)
[![npm version](https://img.shields.io/npm/v/@santhoshdasari/claude-lite-llm-ts.svg)](https://www.npmjs.com/package/@santhoshdasari/claude-lite-llm-ts)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
![Node Version](https://img.shields.io/node/v/@santhoshdasari/claude-lite-llm-ts)

A lightweight TypeScript wrapper around Anthropic's `claude` (Claude Code) CLI that allows developers to run Claude LLMs programmatically using their active **Claude Pro/Team/Max subscription** via `CLAUDE_CODE_TOKEN` — bypassing pay-per-token API keys.

Includes a **`ClaudeSubscriptionProvider`** adapter and a **`litellm`** compatibility layer for registering custom providers in LLM pipelines, plus an OpenAI-compatible local proxy server.

---

## Features

- 🎟️ **Subscription-Powered**: Authenticate using your Claude subscription token (`CLAUDE_CODE_TOKEN`) instead of per-token API keys.
- 🔌 **LiteLLM Custom Provider**: Export and register `ClaudeSubscriptionProvider` via `litellm.custom_provider_map = [...]`.
- ⚡ **OpenAI / LiteLLM Response Parity**: Returns OpenAI-compatible `ModelResponse` with `choices`, `role`, and token `usage` metrics.
- 💬 **Flexible Prompt Formats**: Pass raw prompt strings or conversational message arrays (`[{ role: 'user', content: '...' }]`).
- 🛡️ **Safe LLM Execution**: Disables built-in CLI tool execution (file editing, shell execution) by default with `--tools ""` for pure text completions.
- 🌐 **Built-in OpenAI-Compatible HTTP Proxy**: Run a local HTTP server (`/v1/chat/completions`, `/v1/models`) to integrate with any OpenAI client, LangChain, or LiteLLM proxy.
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

### Prerequisites

Ensure the Claude Code CLI is installed and configured on your machine:

```bash
npm install -g @anthropic-ai/claude-code
# or native install:
# curl -fsSL https://claude.ai/install.sh | bash
```

Generate your subscription token (or retrieve your existing session token):

```bash
claude setup-token
```

Add the token to your `.env` file or export it:

```env
CLAUDE_CODE_TOKEN=sk-ant-oat01-...
```

---

## Quick Start

### 1. Register with LiteLLM Custom Provider

Use the exact custom provider registration pattern with LiteLLM:

```typescript
import { litellm, ClaudeSubscriptionProvider } from '@santhoshdasari/claude-lite-llm-ts';

// 1. Instantiate and register the custom provider
const claude_provider = new ClaudeSubscriptionProvider();
litellm.custom_provider_map = [{ provider: 'claude_sub', custom_handler: claude_provider }];

// 2. Call completion via custom provider
const response = await litellm.completion({
  model: 'claude_sub/sonnet',
  messages: [
    { role: 'system', content: 'You are an expert software engineer.' },
    { role: 'user', content: 'Explain event loops in Node.js in 2 sentences.' },
  ],
});

console.log(response.choices[0].message.content);
console.log('Tokens:', response.usage);
```

### 2. Direct Function Call (`completion`)

```typescript
import { completion } from '@santhoshdasari/claude-lite-llm-ts';

const response = await completion('Explain quantum computing in 2 sentences.', {
  model: 'sonnet', // or 'haiku', 'opus', 'claude-3-7-sonnet-latest'
});

console.log(response.content);
console.log(`Tokens: ${response.usage.inputTokens} in / ${response.usage.outputTokens} out`);
```

### 3. Using `ClaudeClient` Class

```typescript
import { ClaudeClient } from '@santhoshdasari/claude-lite-llm-ts';

const client = new ClaudeClient({
  defaultModel: 'sonnet',
  // token: 'sk-ant-oat01-...', // optional: auto-loads CLAUDE_CODE_TOKEN from .env
});

const response = await client.completion([
  { role: 'user', content: 'Draft a quick haiku about coding.' },
]);

console.log(response.content);
```

### 4. Run as Local OpenAI Proxy Server

You can start a local proxy server that implements the OpenAI `/v1/chat/completions` API:

```bash
npx claude-lite-llm-ts serve --port 4000
```

Or programmatically in TypeScript:

```typescript
import { serveClaudeProxy } from '@santhoshdasari/claude-lite-llm-ts';

const { url, server } = await serveClaudeProxy({ port: 4000 });
console.log(`OpenAI-compatible server running at ${url}/v1/chat/completions`);
```

Then point any OpenAI SDK, LangChain, or Cursor to `http://localhost:4000/v1` with any dummy key (e.g. `api_key="none"`).

---

## Error Handling

When session limits or quota thresholds are reached on your Claude subscription, typed exceptions are raised:

```typescript
import {
  completion,
  ClaudeRateLimitError,
  ClaudeAuthError,
  ClaudeCLINotFoundError,
} from '@santhoshdasari/claude-lite-llm-ts';

try {
  const res = await completion('Hello Claude!');
  console.log(res.content);
} catch (err) {
  if (err instanceof ClaudeRateLimitError) {
    console.error('Subscription quota or rate limit reached:', err.message);
  } else if (err instanceof ClaudeAuthError) {
    console.error('Token authentication failure:', err.message);
  } else if (err instanceof ClaudeCLINotFoundError) {
    console.error('Claude CLI executable not found:', err.message);
  } else {
    console.error('Execution error:', err);
  }
}
```

---

## CLI Usage

```bash
# Run one-off prompt
npx claude-lite-llm-ts "What is the capital of France?" --model sonnet

# Start OpenAI-compatible HTTP server
npx claude-lite-llm-ts serve --port 4000
```

---

## Development

```bash
# Install dependencies
npm install

# Run test suite
npm test

# Type check
npm run typecheck

# Lint code
npm run lint

# Build bundles
npm run build
```

---

## License

[MIT](LICENSE) © 2026 D S Santhosh
