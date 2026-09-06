/**
 * Lightweight OpenAI / LiteLLM compatible HTTP proxy server.
 * Enables any OpenAI SDK, LiteLLM proxy, or tool to call Claude CLI via subscription.
 */

import http from 'node:http';
import { ClaudeClient } from './client.js';
import { ClaudeSubscriptionProvider } from './provider.js';
import type { ChatCompletionRequest } from './types.js';

export interface ServerOptions {
  port?: number;
  host?: string;
  client?: ClaudeClient;
  provider?: ClaudeSubscriptionProvider;
}

export function createClaudeServer(options: ServerOptions = {}): http.Server {
  const provider = options.provider || new ClaudeSubscriptionProvider({ client: options.client });

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
      res.end(JSON.stringify({ status: 'ok', provider: 'claude_sub' }));
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
          const result = await provider.completion(parsed);

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(result));
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              error: {
                message,
                type: 'claude_execution_error',
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

export function serveClaudeProxy(options: ServerOptions = {}): Promise<{
  server: http.Server;
  port: number;
  url: string;
}> {
  const port = options.port || Number(process.env.PORT || 4000);
  const host = options.host || '0.0.0.0';
  const server = createClaudeServer(options);

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
