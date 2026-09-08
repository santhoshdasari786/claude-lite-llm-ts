#!/usr/bin/env node

/**
 * CLI binary entrypoint for claude-lite-llm-ts.
 */

import { codexCompletion, completion } from './core.js';
import { serveProxy } from './server.js';

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command || command === '--help' || command === '-h') {
    console.log(`
Claude & Codex Lite LLM (TypeScript) - Programmatic CLI & LiteLLM Custom Provider

Usage:
  claude-lite-llm-ts "<prompt>"                 Run a prompt using Claude CLI
  claude-lite-llm-ts --provider codex "<prompt>" Run a prompt using Codex CLI
  claude-lite-llm-ts serve [--port 4000]         Start OpenAI/LiteLLM compatible HTTP server

Options:
  --provider <name>  Provider: 'claude' (default) or 'codex'
  --model <name>     Model name or alias (e.g. sonnet, haiku, o3-mini, gpt-4o)
  --port <number>    Port for HTTP server (default 4000)
  --help, -h         Show help
`);
    return;
  }

  if (command === 'serve') {
    const portIndex = args.indexOf('--port');
    const port = portIndex !== -1 && args[portIndex + 1] ? Number(args[portIndex + 1]) : 4000;
    const info = await serveProxy({ port });
    console.log(`Proxy server listening at ${info.url}`);
    console.log(`- OpenAI Chat Completions: ${info.url}/v1/chat/completions`);
    console.log(`- Models Endpoint:         ${info.url}/v1/models`);
    console.log(`- Health Check:            ${info.url}/health`);
    return;
  }

  const providerIndex = args.indexOf('--provider');
  const providerArg = providerIndex !== -1 ? args[providerIndex + 1] : undefined;
  const provider = providerArg ? providerArg.toLowerCase() : '';

  const modelIndex = args.indexOf('--model');
  const model = modelIndex !== -1 ? args[modelIndex + 1] : undefined;

  const promptArgs = args.filter(
    (a, i) =>
      i !== providerIndex && i !== providerIndex + 1 && i !== modelIndex && i !== modelIndex + 1,
  );
  const prompt = promptArgs.join(' ');

  const isCodex =
    provider === 'codex' ||
    (model &&
      (model.toLowerCase().startsWith('o3') ||
        model.toLowerCase().startsWith('o1') ||
        model.toLowerCase().startsWith('gpt-') ||
        model.toLowerCase().startsWith('codex')));

  try {
    if (isCodex) {
      const response = await codexCompletion(prompt, { model });
      console.log(response.content);
    } else {
      const response = await completion(prompt, { model });
      console.log(response.content);
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`Error: ${msg}`);
    process.exit(1);
  }
}

void main();
