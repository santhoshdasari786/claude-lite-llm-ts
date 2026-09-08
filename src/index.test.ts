import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  ClaudeClient,
  ClaudeSubscriptionProvider,
  CodexClient,
  CodexSubscriptionProvider,
  litellm,
  completion,
  codexCompletion,
  codexCompletionStream,
  createCodexClient,
  greet,
  ClaudeError,
  ClaudeCLINotFoundError,
  ClaudeAuthError,
  ClaudeRateLimitError,
  ClaudeExecutionError,
  CodexError,
  CodexCLINotFoundError,
  CodexAuthError,
  CodexRateLimitError,
  CodexExecutionError,
  createClaudeServer,
  createProxyServer,
} from './index.js';

describe('ClaudeClient', () => {
  let client: ClaudeClient;

  beforeEach(() => {
    client = new ClaudeClient({
      token: 'test-token-123',
      claudePath: process.execPath,
    });
  });

  it('initializes with token and resolves binary', () => {
    expect(client.token).toBe('test-token-123');
    expect(client.claudePath).toBe(process.execPath);
  });

  it('throws ClaudeCLINotFoundError when path is invalid', () => {
    expect(() => {
      new ClaudeClient({ claudePath: '/non/existent/claude/binary' });
    }).toThrow(ClaudeCLINotFoundError);
  });

  it('builds environment with CLAUDE_CODE_TOKEN', () => {
    const env = client.buildEnv();
    expect(env.CLAUDE_CODE_TOKEN).toBe('test-token-123');
  });

  it('formats raw string prompts directly', () => {
    const formatted = client.formatPrompt('What is TypeScript?');
    expect(formatted.promptText).toBe('What is TypeScript?');
    expect(formatted.extractedSystemPrompt).toBeUndefined();
  });

  it('formats single user message directly without prefix', () => {
    const formatted = client.formatPrompt([{ role: 'user', content: 'What is LiteLLM?' }]);
    expect(formatted.promptText).toBe('What is LiteLLM?');
    expect(formatted.extractedSystemPrompt).toBeUndefined();
  });

  it('extracts system messages and structures conversation history', () => {
    const formatted = client.formatPrompt([
      { role: 'system', content: 'You are an expert coder.' },
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi there' },
      { role: 'user', content: 'Can you help?' },
    ]);

    expect(formatted.extractedSystemPrompt).toBe('You are an expert coder.');
    expect(formatted.promptText).toContain('User: Hello');
    expect(formatted.promptText).toContain('Assistant: Hi there');
    expect(formatted.promptText).toContain('User: Can you help?');
  });

  it('builds CLI command with appropriate default flags', () => {
    const { cmd, args } = client.buildCommand('Test prompt', {
      model: 'sonnet',
      systemPrompt: 'System instructions',
      dangerouslySkipPermissions: true,
    });

    expect(cmd).toBe(process.execPath);
    expect(args).toEqual([
      '-p',
      'Test prompt',
      '--output-format',
      'json',
      '--no-session-persistence',
      '--model',
      'sonnet',
      '--system-prompt',
      'System instructions',
      '--tools',
      '',
      '--dangerously-skip-permissions',
    ]);
  });

  it('parses valid JSON response from CLI', () => {
    const mockJson = JSON.stringify({
      result: 'Here is the answer.',
      session_id: 'sess-abc-123',
      duration_ms: 150,
      total_cost_usd: 0.005,
      usage: {
        input_tokens: 15,
        output_tokens: 25,
      },
    });

    const parsed = client.parseOutput(mockJson, '', 0);
    expect(parsed.content).toBe('Here is the answer.');
    expect(parsed.sessionId).toBe('sess-abc-123');
    expect(parsed.durationMs).toBe(150);
    expect(parsed.usage.inputTokens).toBe(15);
    expect(parsed.usage.outputTokens).toBe(25);
    expect(parsed.usage.totalTokens).toBe(40);
    expect(parsed.usage.totalCostUsd).toBe(0.005);
  });

  it('throws ClaudeRateLimitError on 429 or session limit messages', () => {
    const mock429 = JSON.stringify({
      api_error_status: 429,
      result: 'Session limit reached. Resets at 5 PM.',
    });

    expect(() => client.parseOutput(mock429, '', 0)).toThrow(ClaudeRateLimitError);
  });

  it('throws ClaudeAuthError on 401/403 or unauthorized messages', () => {
    const mock401 = JSON.stringify({
      api_error_status: 401,
      result: 'Unauthorized. Invalid subscription token.',
    });

    expect(() => client.parseOutput(mock401, '', 0)).toThrow(ClaudeAuthError);
  });

  it('throws ClaudeExecutionError on is_error response or non-zero exit code', () => {
    const mockError = JSON.stringify({
      is_error: true,
      result: 'Unexpected error in claude core.',
    });

    expect(() => client.parseOutput(mockError, '', 1)).toThrow(ClaudeExecutionError);

    expect(() => client.parseOutput('', 'Command failed to run', 1)).toThrow(ClaudeExecutionError);
  });
});

describe('ClaudeSubscriptionProvider & LiteLLM Integration', () => {
  it('cleans model name prefix properly', () => {
    const provider = new ClaudeSubscriptionProvider({
      claudePath: process.execPath,
    });

    expect(provider.cleanModelName('claude_sub/sonnet')).toBe('sonnet');
    expect(provider.cleanModelName('claude-sub/haiku')).toBe('haiku');
    expect(provider.cleanModelName('claude-3-7-sonnet-latest')).toBe('claude-3-7-sonnet-latest');
  });

  it('converts ClaudeResponse to OpenAI/LiteLLM ModelResponse', async () => {
    const mockClient = {
      completion: vi.fn().mockResolvedValue({
        content: 'Response text from subscription Claude',
        sessionId: 'test-session',
        durationMs: 250,
        usage: {
          inputTokens: 20,
          outputTokens: 30,
          totalTokens: 50,
          totalCostUsd: 0.002,
        },
      }),
    } as unknown as ClaudeClient;

    const provider = new ClaudeSubscriptionProvider({ client: mockClient });

    const response = await provider.completion({
      model: 'claude_sub/sonnet',
      messages: [{ role: 'user', content: 'Hello Claude' }],
    });

    expect(response.object).toBe('chat.completion');
    expect(response.model).toBe('sonnet');
    expect(response.choices[0]!.message.content).toBe('Response text from subscription Claude');
    expect(response.choices[0]!.finish_reason).toBe('stop');
    expect(response.usage.prompt_tokens).toBe(20);
    expect(response.usage.completion_tokens).toBe(30);
    expect(response.usage.total_tokens).toBe(50);
  });

  it('registers and dispatches via litellm.custom_provider_map', async () => {
    const mockHandler = {
      completion: vi.fn().mockResolvedValue({
        id: 'chatcmpl-test',
        object: 'chat.completion',
        created: Date.now(),
        model: 'sonnet',
        choices: [
          {
            index: 0,
            message: { role: 'assistant', content: 'Handled via custom provider!' },
            finish_reason: 'stop',
          },
        ],
        usage: { prompt_tokens: 5, completion_tokens: 10, total_tokens: 15 },
      }),
    };

    // User's exact requested pattern:
    litellm.custom_provider_map = [{ provider: 'claude_sub', custom_handler: mockHandler }];

    expect(litellm.custom_provider_map).toHaveLength(1);

    const result = await litellm.completion({
      model: 'claude_sub/sonnet',
      messages: [{ role: 'user', content: 'Ping' }],
    });

    expect(mockHandler.completion).toHaveBeenCalledTimes(1);
    expect(result.choices[0]!.message.content).toBe('Handled via custom provider!');
  });

  it('throws error when provider is unknown', async () => {
    litellm.custom_provider_map = [];

    await expect(
      litellm.completion({
        model: 'unknown_provider/model',
        messages: [{ role: 'user', content: 'Ping' }],
      }),
    ).rejects.toThrow(ClaudeError);
  });
});

describe('createClaudeServer', () => {
  it('creates an HTTP server instance and responds to /health', async () => {
    const server = createClaudeServer({
      client: new ClaudeClient({ claudePath: process.execPath }),
    });
    expect(server).toBeDefined();
    expect(typeof server.listen).toBe('function');

    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        const addr = server.address() as import('node:net').AddressInfo;
        import('node:http').then(({ get }) => {
          get(`http://127.0.0.1:${addr.port}/health`, (res) => {
            expect(res.statusCode).toBe(200);
            server.close(() => resolve());
          });
        });
      });
    });
  });

  it('responds to /v1/models', async () => {
    const server = createClaudeServer({
      client: new ClaudeClient({ claudePath: process.execPath }),
    });

    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        const addr = server.address() as import('node:net').AddressInfo;
        import('node:http').then(({ get }) => {
          get(`http://127.0.0.1:${addr.port}/v1/models`, (res) => {
            expect(res.statusCode).toBe(200);
            server.close(() => resolve());
          });
        });
      });
    });
  });
});

describe('greet', () => {
  it('returns formatted greeting', () => {
    expect(greet('World')).toBe('Hello, World!');
  });

  it('throws if name is empty', () => {
    expect(() => greet('')).toThrow('name must not be empty');
  });
});

describe('core functions', () => {
  it('createClient returns a ClaudeClient instance', async () => {
    const { createClient } = await import('./core.js');
    const c = createClient({ claudePath: process.execPath });
    expect(c).toBeInstanceOf(ClaudeClient);
  });

  it('instantiates client and calls completion', async () => {
    const spy = vi.spyOn(ClaudeClient.prototype, 'completion').mockResolvedValueOnce({
      content: 'Top-level completion response',
      durationMs: 120,
      usage: { inputTokens: 5, outputTokens: 10, totalTokens: 15, totalCostUsd: 0.001 },
    });

    const res = await completion('Hello top level', {
      claudePath: process.execPath,
    });

    expect(spy).toHaveBeenCalledTimes(1);
    expect(res.content).toBe('Top-level completion response');
    spy.mockRestore();
  });

  it('calls completionStream', async () => {
    const { completionStream } = await import('./core.js');
    async function* mockStream() {
      yield { type: 'delta' as const, text: 'Streamed' };
    }
    const spy = vi
      .spyOn(ClaudeClient.prototype, 'completionStream')
      .mockReturnValueOnce(mockStream());

    const chunks = [];
    for await (const chunk of completionStream('Test stream', { claudePath: process.execPath })) {
      chunks.push(chunk);
    }

    expect(chunks).toHaveLength(1);
    expect(chunks[0]!.text).toBe('Streamed');
    spy.mockRestore();
  });
});

describe('ClaudeSubscriptionProvider Tool Calling', () => {
  it('detects and parses JSON tool calls into OpenAI tool_calls structure', async () => {
    const mockClient = {
      completion: vi.fn().mockResolvedValue({
        content: JSON.stringify({
          tool_calls: [
            {
              name: 'get_weather',
              arguments: { location: 'Tokyo', unit: 'celsius' },
            },
          ],
        }),
        durationMs: 100,
        usage: { inputTokens: 10, outputTokens: 15, totalTokens: 25, totalCostUsd: 0.001 },
      }),
    } as unknown as ClaudeClient;

    const provider = new ClaudeSubscriptionProvider({ client: mockClient });

    const response = (await provider.completion({
      model: 'claude_sub/sonnet',
      messages: [{ role: 'user', content: 'What is the weather in Tokyo?' }],
      tools: [
        {
          type: 'function',
          function: {
            name: 'get_weather',
            description: 'Get weather for location',
            parameters: {
              type: 'object',
              properties: { location: { type: 'string' } },
            },
          },
        },
      ],
    })) as import('./types.js').ModelResponse;

    expect(response.choices[0]!.finish_reason).toBe('tool_calls');
    expect(response.choices[0]!.message.tool_calls).toHaveLength(1);
    expect(response.choices[0]!.message.tool_calls![0]!.function.name).toBe('get_weather');
    expect(JSON.parse(response.choices[0]!.message.tool_calls![0]!.function.arguments)).toEqual({
      location: 'Tokyo',
      unit: 'celsius',
    });
  });
});

describe('ClaudeSubscriptionProvider Streaming', () => {
  it('streams ChatCompletionChunk objects in real time', async () => {
    async function* mockStream() {
      yield { type: 'delta' as const, text: 'Hello' };
      yield { type: 'delta' as const, text: ' world' };
      yield {
        type: 'final' as const,
        text: '',
        usage: { inputTokens: 5, outputTokens: 2, totalTokens: 7, totalCostUsd: 0.0001 },
      };
    }

    const mockClient = {
      completionStream: vi.fn().mockReturnValue(mockStream()),
    } as unknown as ClaudeClient;

    const provider = new ClaudeSubscriptionProvider({ client: mockClient });

    const stream = (await provider.completion({
      model: 'claude_sub/sonnet',
      messages: [{ role: 'user', content: 'Say hello world' }],
      stream: true,
    })) as AsyncIterable<import('./types.js').ChatCompletionChunk>;

    const chunks: import('./types.js').ChatCompletionChunk[] = [];
    for await (const chunk of stream) {
      chunks.push(chunk);
    }

    expect(chunks).toHaveLength(3);
    expect(chunks[0]!.choices[0]!.delta.content).toBe('Hello');
    expect(chunks[1]!.choices[0]!.delta.content).toBe(' world');
    expect(chunks[2]!.choices[0]!.finish_reason).toBe('stop');
    expect(chunks[2]!.usage?.total_tokens).toBe(7);
  });
});

describe('CodexClient', () => {
  let client: CodexClient;

  beforeEach(() => {
    client = new CodexClient({
      apiKey: 'sk-test-123',
      codexPath: process.execPath,
    });
  });

  it('initializes with apiKey and resolves binary', () => {
    expect(client.apiKey).toBe('sk-test-123');
    expect(client.codexPath).toBe(process.execPath);
  });

  it('throws CodexCLINotFoundError when explicit path is invalid', () => {
    expect(() => {
      new CodexClient({ codexPath: '/non/existent/codex/binary' });
    }).toThrow(CodexCLINotFoundError);
  });

  it('builds environment with OPENAI_API_KEY and CODEX_API_KEY', () => {
    const env = client.buildEnv();
    expect(env.OPENAI_API_KEY).toBe('sk-test-123');
    expect(env.CODEX_API_KEY).toBe('sk-test-123');
  });

  it('formats raw string prompts directly', () => {
    const formatted = client.formatPrompt('What is Python?');
    expect(formatted.promptText).toBe('What is Python?');
    expect(formatted.extractedSystemPrompt).toBeUndefined();
  });

  it('formats single user message directly without prefix', () => {
    const formatted = client.formatPrompt([{ role: 'user', content: 'What is LiteLLM?' }]);
    expect(formatted.promptText).toBe('What is LiteLLM?');
    expect(formatted.extractedSystemPrompt).toBeUndefined();
  });

  it('extracts system messages and structures conversation history', () => {
    const formatted = client.formatPrompt([
      { role: 'system', content: 'You are an OpenAI assistant.' },
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi there' },
      { role: 'user', content: 'Can you write code?' },
    ]);

    expect(formatted.extractedSystemPrompt).toBe('You are an OpenAI assistant.');
    expect(formatted.promptText).toContain('User: Hello');
    expect(formatted.promptText).toContain('Assistant: Hi there');
    expect(formatted.promptText).toContain('User: Can you write code?');
  });

  it('builds CLI command with appropriate default flags', () => {
    const { cmd, args } = client.buildCommand('Test codex prompt', {
      model: 'o3-mini',
      fullAuto: true,
      sandbox: 'read-only',
    });

    expect(cmd).toBe(process.execPath);
    expect(args[0]).toBe('exec');
    expect(args).toContain('--ephemeral');
    expect(args).toContain('--skip-git-repo-check');
    expect(args).toContain('-c');
    expect(args).toContain('model="o3-mini"');
    expect(args).toContain('--full-auto');
    expect(args).toContain('--sandbox');
    expect(args).toContain('read-only');
    expect(args[args.length - 1]).toBe('Test codex prompt');
  });
});

describe('CodexSubscriptionProvider', () => {
  let provider: CodexSubscriptionProvider;
  let mockClient: CodexClient;

  beforeEach(() => {
    mockClient = {
      completion: vi.fn().mockResolvedValue({
        content: 'Response from Codex',
        sessionId: 'codex-sess-1',
        durationMs: 250,
        usage: {
          inputTokens: 12,
          outputTokens: 8,
          totalTokens: 20,
          totalCostUsd: 0,
        },
      }),
      completionStream: vi.fn(),
    } as unknown as CodexClient;

    provider = new CodexSubscriptionProvider({ client: mockClient });
  });

  it('normalizes model name by stripping provider prefixes', () => {
    expect(provider.cleanModelName('codex_sub/o3-mini')).toBe('o3-mini');
    expect(provider.cleanModelName('codex_lite/gpt-4o')).toBe('gpt-4o');
    expect(provider.cleanModelName('codex/o1')).toBe('o1');
    expect(provider.cleanModelName('o3-mini')).toBe('o3-mini');
  });

  it('executes completion and returns standard ModelResponse', async () => {
    const response = (await provider.completion({
      model: 'codex_sub/o3-mini',
      messages: [{ role: 'user', content: 'Write a quicksort' }],
    })) as import('./types.js').ModelResponse;

    expect(response.object).toBe('chat.completion');
    expect(response.model).toBe('codex_sub/o3-mini');
    expect(response.choices[0]!.message.content).toBe('Response from Codex');
    expect(response.choices[0]!.finish_reason).toBe('stop');
    expect(response.usage.total_tokens).toBe(20);
  });

  it('parses tool calls when model emits tool call json', async () => {
    const toolCallClient = {
      completion: vi.fn().mockResolvedValue({
        content: JSON.stringify({
          tool_calls: [
            {
              name: 'calculate_tax',
              arguments: { amount: 100, state: 'CA' },
            },
          ],
        }),
        durationMs: 150,
        usage: { inputTokens: 20, outputTokens: 15, totalTokens: 35, totalCostUsd: 0 },
      }),
    } as unknown as CodexClient;

    const toolProvider = new CodexSubscriptionProvider({ client: toolCallClient });

    const response = (await toolProvider.completion({
      model: 'codex_sub/o3-mini',
      messages: [{ role: 'user', content: 'Calculate CA tax on 100' }],
      tools: [
        {
          type: 'function',
          function: {
            name: 'calculate_tax',
            parameters: { type: 'object' },
          },
        },
      ],
    })) as import('./types.js').ModelResponse;

    expect(response.choices[0]!.finish_reason).toBe('tool_calls');
    expect(response.choices[0]!.message.tool_calls).toHaveLength(1);
    expect(response.choices[0]!.message.tool_calls![0]!.function.name).toBe('calculate_tax');
  });

  it('streams ChatCompletionChunk objects in real time', async () => {
    async function* mockStream() {
      yield { type: 'delta' as const, text: 'Hello' };
      yield { type: 'delta' as const, text: ' from Codex' };
      yield {
        type: 'final' as const,
        text: '',
        usage: { inputTokens: 4, outputTokens: 3, totalTokens: 7, totalCostUsd: 0 },
      };
    }

    const streamClient = {
      completionStream: vi.fn().mockReturnValue(mockStream()),
    } as unknown as CodexClient;

    const streamProvider = new CodexSubscriptionProvider({ client: streamClient });

    const stream = (await streamProvider.completion({
      model: 'codex_sub/o3-mini',
      messages: [{ role: 'user', content: 'Hi' }],
      stream: true,
    })) as AsyncIterable<import('./types.js').ChatCompletionChunk>;

    const chunks: import('./types.js').ChatCompletionChunk[] = [];
    for await (const chunk of stream) {
      chunks.push(chunk);
    }

    expect(chunks).toHaveLength(3);
    expect(chunks[0]!.choices[0]!.delta.content).toBe('Hello');
    expect(chunks[1]!.choices[0]!.delta.content).toBe(' from Codex');
    expect(chunks[2]!.choices[0]!.finish_reason).toBe('stop');
  });
});

describe('LiteLLM Routing with Codex & Claude', () => {
  it('routes to registered codex provider for codex_sub and o3 models', async () => {
    const mockCodexHandler = {
      completion: vi.fn().mockResolvedValue({
        id: 'cmpl-codex-1',
        object: 'chat.completion',
        created: Date.now(),
        model: 'codex_sub/o3-mini',
        choices: [
          {
            index: 0,
            message: { role: 'assistant', content: 'Codex output' },
            finish_reason: 'stop',
          },
        ],
        usage: { prompt_tokens: 5, completion_tokens: 5, total_tokens: 10 },
      }),
    };

    litellm.registerProvider(
      'codex_sub',
      mockCodexHandler as unknown as import('./types.js').CustomLLMHandler,
    );

    const res = await litellm.completion({
      model: 'codex_sub/o3-mini',
      messages: [{ role: 'user', content: 'Test' }],
    });

    expect(mockCodexHandler.completion).toHaveBeenCalled();
    expect((res as import('./types.js').ModelResponse).choices[0]!.message.content).toBe(
      'Codex output',
    );
  });
});

describe('Codex Convenience Functions and Proxy Server', () => {
  it('creates proxy server supporting codex and claude', () => {
    const server = createProxyServer();
    expect(server).toBeDefined();
  });

  it('exposes codexCompletion and codexCompletionStream helper functions', async () => {
    expect(typeof codexCompletion).toBe('function');
    expect(typeof codexCompletionStream).toBe('function');
  });

  it('creates codex client instance using createCodexClient', () => {
    const client = createCodexClient({ apiKey: 'sk-test' });
    expect(client).toBeInstanceOf(CodexClient);
    expect(client.apiKey).toBe('sk-test');
  });
});

describe('Codex Exceptions', () => {
  it('instantiates all Codex exception types properly', () => {
    const err = new CodexError('Base codex error', 'ERR_BASE');
    expect(err.name).toBe('CodexError');
    expect(err.code).toBe('ERR_BASE');

    const notFound = new CodexCLINotFoundError('Not found');
    expect(notFound.name).toBe('CodexCLINotFoundError');
    expect(notFound.code).toBe('ERR_CODEX_NOT_FOUND');

    const auth = new CodexAuthError('Auth error');
    expect(auth.name).toBe('CodexAuthError');
    expect(auth.code).toBe('ERR_CODEX_AUTH');

    const rate = new CodexRateLimitError('Rate limit', { error: 'rate_limited' });
    expect(rate.name).toBe('CodexRateLimitError');
    expect(rate.code).toBe('ERR_CODEX_RATE_LIMIT');
    expect(rate.rawResponse).toEqual({ error: 'rate_limited' });

    const exec = new CodexExecutionError('Failed', { returncode: 1, stderr: 'error details' });
    expect(exec.name).toBe('CodexExecutionError');
    expect(exec.code).toBe('ERR_CODEX_EXECUTION');
    expect(exec.returncode).toBe(1);
    expect(exec.stderr).toBe('error details');
  });
});
