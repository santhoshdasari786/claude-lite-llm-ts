/**
 * Lightweight OpenAI / LiteLLM compatible HTTP proxy server.
 * Enables any OpenAI SDK, LiteLLM proxy, or tool to call Claude and Codex CLI via subscriptions.
 */

import http from 'node:http';
import { ClaudeClient } from './client.js';
import { CodexClient } from './codex-client.js';
import { CodexSubscriptionProvider } from './codex-provider.js';
import { ClaudeSubscriptionProvider } from './provider.js';
import type { ChatCompletionRequest } from './types.js';

export interface ServerOptions {
  port?: number;
  host?: string;
  claudeClient?: ClaudeClient;
  claudeProvider?: ClaudeSubscriptionProvider;
  codexClient?: CodexClient;
  codexProvider?: CodexSubscriptionProvider;
  /** Backwards compatibility alias for claudeClient */
  client?: ClaudeClient;
  /** Backwards compatibility alias for claudeProvider */
  provider?: ClaudeSubscriptionProvider;
}

export function createProxyServer(options: ServerOptions = {}): http.Server {
  const claudeProvider =
    options.claudeProvider ||
    options.provider ||
    new ClaudeSubscriptionProvider({ client: options.claudeClient || options.client });

  const codexProvider =
    options.codexProvider || new CodexSubscriptionProvider({ client: options.codexClient });

  const server = http.createServer(async (req, res) => {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const url = req.url || '';

    // Health check
    if (url === '/health' || url === '/') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          status: 'ok',
          providers: ['claude_sub', 'codex_sub'],
        }),
      );
      return;
    }

    // Models endpoint
    if ((url === '/v1/models' || url === '/models') && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          object: 'list',
          data: [
            { id: 'claude_sub/sonnet', object: 'model', owned_by: 'anthropic-subscription' },
            { id: 'claude_sub/haiku', object: 'model', owned_by: 'anthropic-subscription' },
            { id: 'claude_sub/opus', object: 'model', owned_by: 'anthropic-subscription' },
            { id: 'claude-3-7-sonnet-latest', object: 'model', owned_by: 'anthropic-subscription' },
            { id: 'claude-3-5-sonnet-latest', object: 'model', owned_by: 'anthropic-subscription' },
            { id: 'codex_sub/o3-mini', object: 'model', owned_by: 'openai-subscription' },
            { id: 'codex_sub/gpt-4o', object: 'model', owned_by: 'openai-subscription' },
            { id: 'codex_sub/o1', object: 'model', owned_by: 'openai-subscription' },
            { id: 'o3-mini', object: 'model', owned_by: 'openai-subscription' },
            { id: 'gpt-4o', object: 'model', owned_by: 'openai-subscription' },
          ],
        }),
      );
      return;
    }

    // Chat completions endpoint
    if ((url === '/v1/chat/completions' || url === '/chat/completions') && req.method === 'POST') {
      let body = '';
      req.on('data', (chunk) => {
        body += chunk;
      });

      req.on('end', async () => {
        try {
          const parsed = JSON.parse(body) as ChatCompletionRequest;
          const modelLower = (parsed.model || '').toLowerCase();

          // Route to appropriate provider
          const selectedProvider =
            modelLower.startsWith('codex') ||
            modelLower.startsWith('o1') ||
            modelLower.startsWith('o3') ||
            modelLower.startsWith('o4') ||
            modelLower.startsWith('gpt-')
              ? codexProvider
              : claudeProvider;

          // Real-time Server-Sent Events (SSE) streaming
          if (parsed.stream) {
            res.writeHead(200, {
              'Content-Type': 'text/event-stream',
              'Cache-Control': 'no-cache',
              Connection: 'keep-alive',
              'X-Accel-Buffering': 'no',
            });

            const stream = selectedProvider.completionStream(parsed);
            for await (const chunk of stream) {
              res.write(`data: ${JSON.stringify(chunk)}\n\n`);
            }

            res.write('data: [DONE]\n\n');
            res.end();
            return;
          }

          // Non-streaming completion
          const result = await selectedProvider.completion(parsed);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(result));
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          if (!res.headersSent) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
          }
          res.end(
            JSON.stringify({
              error: {
                message,
                type: 'execution_error',
                code: 500,
              },
            }),
          );
        }
      });
      return;
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
  });

  return server;
}

/**
 * Backwards compatibility alias for `createProxyServer`.
 */
export const createClaudeServer = createProxyServer;

export function serveProxy(options: ServerOptions = {}): Promise<{
  server: http.Server;
  port: number;
  url: string;
}> {
  const port = options.port || Number(process.env.PORT || 4000);
  const host = options.host || '0.0.0.0';
  const server = createProxyServer(options);

  return new Promise((resolve, reject) => {
    server.on('error', reject);
    server.listen(port, host, () => {
      resolve({
        server,
        port,
        url: `http://${host === '0.0.0.0' ? 'localhost' : host}:${port}`,
      });
    });
  });
}

/**
 * Backwards compatibility alias for `serveProxy`.
 */
export const serveClaudeProxy = serveProxy;
