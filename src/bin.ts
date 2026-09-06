#!/usr/bin/env node

/**
 * CLI binary entrypoint for claude-lite-llm-ts.
 */

import { completion } from './core.js';
import { serveClaudeProxy } from './server.js';

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command || command === '--help' || command === '-h') {
    console.log(`
Claude Lite LLM (TypeScript) - Programmatic Claude CLI & LiteLLM Custom Provider

Usage:
  claude-lite-llm-ts "<prompt>"                 Run a one-off prompt
  claude-lite-llm-ts serve [--port 4000]         Start OpenAI/LiteLLM compatible HTTP server

Options:
  --model <name>     Model name or alias (e.g. sonnet, haiku, opus)
  --port <number>    Port for HTTP server (default 4000)
  --help, -h         Show help
`);
    return;
  }

  if (command === 'serve') {
    const portIndex = args.indexOf('--port');
    const port = portIndex !== -1 && args[portIndex + 1] ? Number(args[portIndex + 1]) : 4000;
    const info = await serveClaudeProxy({ port });
    console.log(`Claude LiteLLM proxy server listening at ${info.url}`);
    console.log(`- OpenAI Chat Completions: ${info.url}/v1/chat/completions`);
    console.log(`- Health Check:            ${info.url}/health`);
    return;
  }

  const modelIndex = args.indexOf('--model');
  const model = modelIndex !== -1 && args[modelIndex + 1] ? args[modelIndex + 1] : undefined;

  const prompt = args.filter((a, i) => i !== modelIndex && i !== modelIndex + 1).join(' ');

  try {
    const response = await completion(prompt, { model });
    console.log(response.content);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`Error: ${msg}`);
    process.exit(1);
  }
}

void main();
