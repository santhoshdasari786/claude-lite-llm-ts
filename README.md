# @santhoshdasari/claude-lite-llm-ts

[![CI](https://github.com/santhoshdasari786/claude-lite-llm-ts/actions/workflows/ci.yaml/badge.svg)](https://github.com/santhoshdasari786/claude-lite-llm-ts/actions/workflows/ci.yaml)
[![npm version](https://img.shields.io/npm/v/@santhoshdasari/claude-lite-llm-ts.svg)](https://www.npmjs.com/package/@santhoshdasari/claude-lite-llm-ts)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
![Node Version](https://img.shields.io/node/v/@santhoshdasari/claude-lite-llm-ts)

A lightweight TypeScript wrapper around Anthropic's `claude` (Claude Code) CLI that allows developers to run Claude LLMs programmatically using their active **Claude Pro/Team/Max subscription** via `CLAUDE_CODE_TOKEN` — bypassing pay-per-token API keys.

Includes a **`ClaudeSubscriptionProvider`** adapter and a **`litellm`** compatibility layer for registering custom providers in LLM pipelines, plus real-time streaming, OpenAI function calling / tools support, and a local OpenAI-compatible HTTP proxy server.

---

## Features

- 🎟️ **Subscription-Powered**: Authenticate using your Claude subscription token (`CLAUDE_CODE_TOKEN`) instead of per-token API keys.
- 🔌 **LiteLLM Custom Provider**: Export and register `ClaudeSubscriptionProvider` via `litellm.custom_provider_map = [...]`.
- 🌊 **Real-Time Token Streaming**: Native line-by-line token streaming via `stream: true` or `completionStream()`.
- 🛠️ **OpenAI Tool / Function Calling**: Support for OpenAI-format `tools` returning structured `tool_calls` with `finish_reason: "tool_calls"`.
- ⚡ **OpenAI / LiteLLM Response Parity**: Returns OpenAI-compatible `ModelResponse` with `choices`, `role`, and token `usage` metrics.
- 💬 **Flexible Prompt Formats**: Pass raw prompt strings or conversational message arrays (`[{ role: 'user', content: '...' }]`).
- 🛡️ **Safe LLM Execution**: Disables built-in CLI tool execution by default (`--tools ""`) for pure text completions.
- 🌐 **Built-in OpenAI-Compatible HTTP Proxy**: Run a local HTTP server (`/v1/chat/completions` with SSE streaming, `/v1/models`) to integrate with any OpenAI client, LangChain, or LiteLLM proxy.
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

## Usage Guide

### 1. Register with LiteLLM Custom Provider

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

---

### 2. Real-Time Token Streaming 🌊

#### Via `litellm.completion({ stream: true })`

```typescript
import { litellm, ClaudeSubscriptionProvider } from '@santhoshdasari/claude-lite-llm-ts';

const claude_provider = new ClaudeSubscriptionProvider();
litellm.custom_provider_map = [{ provider: 'claude_sub', custom_handler: claude_provider }];

const stream = await litellm.completion({
  model: 'claude_sub/sonnet',
  messages: [{ role: 'user', content: 'Count from 1 to 5 slowly.' }],
  stream: true,
});

for await (const chunk of stream) {
  const token = chunk.choices[0]?.delta?.content;
  if (token) process.stdout.write(token);
}
```

#### Via direct `completionStream()`

```typescript
import { completionStream } from '@santhoshdasari/claude-lite-llm-ts';

for await (const chunk of completionStream('Write a short haiku about coding.')) {
  if (chunk.type === 'delta') {
    process.stdout.write(chunk.text);
  } else if (chunk.type === 'final') {
    console.log('\nUsage:', chunk.usage);
  }
}
```

---

### 3. OpenAI Tools & Function Calling 🛠️

Pass standard OpenAI-compatible tool definitions. The provider prompts Claude and returns standard `tool_calls`:

```typescript
import { litellm, ClaudeSubscriptionProvider } from '@santhoshdasari/claude-lite-llm-ts';

const claude_provider = new ClaudeSubscriptionProvider();
litellm.custom_provider_map = [{ provider: 'claude_sub', custom_handler: claude_provider }];

const response = await litellm.completion({
  model: 'claude_sub/sonnet',
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

### 4. Direct Function Call (`completion`)

```typescript
import { completion } from '@santhoshdasari/claude-lite-llm-ts';

const response = await completion('Explain quantum computing in 2 sentences.', {
  model: 'sonnet', // or 'haiku', 'opus', 'claude-3-7-sonnet-latest'
});

console.log(response.content);
console.log(`Tokens: ${response.usage.inputTokens} in / ${response.usage.outputTokens} out`);
```

---

### 5. Run as Local OpenAI Proxy Server (with SSE Streaming)

Start the proxy server via CLI:

```bash
npx claude-lite-llm-ts serve --port 4000
```

Or programmatically:

```typescript
import { serveClaudeProxy } from '@santhoshdasari/claude-lite-llm-ts';

const { url } = await serveClaudeProxy({ port: 4000 });
console.log(`OpenAI-compatible server running at ${url}/v1/chat/completions`);
```

You can now configure OpenAI clients, LangChain, or Cursor:

```python
from openai import OpenAI

client = OpenAI(base_url="http://localhost:4000/v1", api_key="none")

stream = client.chat.completions.create(
    model="claude_sub/sonnet",
    messages=[{"role": "user", "content": "Hello!"}],
    stream=True,
)

for chunk in stream:
    print(chunk.choices[0].delta.content or "", end="")
```

---

## Error Handling

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
    console.error('Subscription quota reached:', err.message);
  } else if (err instanceof ClaudeAuthError) {
    console.error('Authentication failure:', err.message);
  } else if (err instanceof ClaudeCLINotFoundError) {
    console.error('Claude CLI executable not found:', err.message);
  } else {
    console.error('Execution error:', err);
  }
}
```

---

## Testing

```bash
# Run unit tests
npm test

# Run manual live tests
node manual-tests/test_completion.mjs
node manual-tests/test_stream.mjs
node manual-tests/test_tools.mjs
```

---

## License

[MIT](LICENSE) © 2026 D S Santhosh
