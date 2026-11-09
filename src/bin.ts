#!/usr/bin/env node

/**
 * CLI binary entrypoint for claude-lite-llm-ts.
 */

import {
  codexCompletion,
  completion,
  createClient,
  createCodexClient,
  getSessionUsage,
  getStatusLine,
  getUsageLimits,
} from './core.js';
import { serveProxy } from './server.js';
import type { UsageProviderType } from './usage-types.js';

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0] ? args[0].toLowerCase() : '';

  if (!command || command === '--help' || command === '-h') {
    console.log(`
Claude & Codex Lite LLM (TypeScript) - Programmatic CLI & LiteLLM Custom Provider

Usage:
  claude-lite-llm-ts "<prompt>"                   Run a prompt using Claude CLI
  claude-lite-llm-ts --provider codex "<prompt>"   Run a prompt using Codex CLI
  claude-lite-llm-ts status [--provider <name>]    Show status & health diagnostics (/status)
  claude-lite-llm-ts usage [--provider <name>]     Show session token usage & limits (/usage)
  claude-lite-llm-ts statusline [--provider <name>] Show single-line statusbar (/statusline)
  claude-lite-llm-ts serve [--port 4000]           Start OpenAI/LiteLLM compatible HTTP server

Commands:
  status, /status       Display CLI, authentication, health, and limit diagnostics
  usage, /usage         Display token consumption, context headroom, and costs
  statusline, /statusline Display concise single-line usage statusline
  serve                 Start background OpenAI/LiteLLM compatible proxy server

Options:
  --provider <name>     Provider: 'claude' (default) or 'codex'
  --session <id>        Session identifier for session-scoped usage
  --model <name>        Model name or alias (e.g. sonnet, haiku, o3-mini, gpt-4o)
  --port <number>       Port for HTTP server (default 4000)
  --json                Output results in JSON format
  --help, -h            Show help
`);
    return;
  }

  const providerIndex = args.indexOf('--provider');
  const providerArg = providerIndex !== -1 ? args[providerIndex + 1] : undefined;
  const provider: UsageProviderType =
    providerArg && providerArg.toLowerCase() === 'codex' ? 'codex' : 'claude';

  const sessionIndex = args.indexOf('--session');
  const sessionId = sessionIndex !== -1 ? args[sessionIndex + 1] : undefined;

  const isJson = args.includes('--json');

  // Status command (/status or status)
  if (command === 'status' || command === '/status') {
    try {
      const client = provider === 'codex' ? createCodexClient() : createClient();
      const statusReport = await client.getStatus(sessionId);

      if (isJson) {
        console.log(JSON.stringify(statusReport, null, 2));
        return;
      }

      console.log(`\n=== ${statusReport.provider.toUpperCase()} CLI STATUS ===`);
      console.log(`Version:        ${statusReport.version}`);
      console.log(`Health:         ${statusReport.health.toUpperCase()}`);
      console.log(`CLI Installed:  ${statusReport.cliStatus.installed ? 'Yes' : 'No'}`);
      console.log(`CLI Path:       ${statusReport.cliStatus.path || 'Not found'}`);
      if (statusReport.cliStatus.version) {
        console.log(`CLI Version:    ${statusReport.cliStatus.version}`);
      }
      console.log(
        `Auth Config:    ${statusReport.authStatus.authenticated ? 'Configured' : 'Missing'}`,
      );
      if (statusReport.authStatus.tokenPreview) {
        console.log(`Token Preview:  ${statusReport.authStatus.tokenPreview}`);
      }

      if (statusReport.limits) {
        console.log(`\n--- Limits & Context Window ---`);
        console.log(`Model:          ${statusReport.currentSession?.model || 'default'}`);
        console.log(`Context Window: ${statusReport.limits.contextWindow.toLocaleString()} tokens`);
        console.log(
          `Used Tokens:    ${statusReport.limits.contextWindowUsedTokens.toLocaleString()} (${statusReport.limits.contextWindowPercent}%)`,
        );
        console.log(
          `Remaining:      ${statusReport.limits.contextWindowRemainingTokens.toLocaleString()} tokens`,
        );
        console.log(`Status:         ${statusReport.limits.status.toUpperCase()}`);
      }

      const statusline = client.getStatusLine(sessionId);
      console.log(`\nStatusline:     ${statusline}\n`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`Status error: ${msg}`);
      process.exit(1);
    }
    return;
  }

  // Usage command (/usage or usage)
  if (command === 'usage' || command === '/usage') {
    try {
      const session = getSessionUsage(sessionId, provider);
      const limits = getUsageLimits(sessionId, session.model);

      if (isJson) {
        console.log(JSON.stringify({ session, limits }, null, 2));
        return;
      }

      console.log(`\n=== SESSION USAGE REPORT [${provider.toUpperCase()}] ===`);
      console.log(`Session ID:     ${session.sessionId}`);
      console.log(`Model:          ${session.model}`);
      console.log(`Total Requests: ${session.requestCount}`);
      console.log(`Input Tokens:   ${session.inputTokens.toLocaleString()}`);
      console.log(`Output Tokens:  ${session.outputTokens.toLocaleString()}`);
      console.log(`Total Tokens:   ${session.totalTokens.toLocaleString()}`);
      console.log(`Total Cost:     $${session.totalCostUsd.toFixed(4)} USD`);
      console.log(`Duration:       ${session.durationMs}ms`);
      console.log(`\n--- Context Window Headroom ---`);
      console.log(`Capacity:       ${limits.contextWindow.toLocaleString()} tokens`);
      console.log(
        `Consumed:       ${limits.contextWindowUsedTokens.toLocaleString()} tokens (${limits.contextWindowPercent}%)`,
      );
      console.log(
        `Headroom:       ${limits.contextWindowRemainingTokens.toLocaleString()} tokens remaining`,
      );
      console.log(`Status:         ${limits.status.toUpperCase()}`);
      console.log(`\nStatusline:     ${getStatusLine({ provider, sessionId })}\n`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`Usage error: ${msg}`);
      process.exit(1);
    }
    return;
  }

  // Statusline command (/statusline or statusline)
  if (command === 'statusline' || command === '/statusline') {
    try {
      const line = getStatusLine({ provider, sessionId });
      if (isJson) {
        const session = getSessionUsage(sessionId, provider);
        const limits = getUsageLimits(sessionId, session.model);
        console.log(JSON.stringify({ statusline: line, session, limits }));
      } else {
        console.log(line);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`Statusline error: ${msg}`);
      process.exit(1);
    }
    return;
  }

  if (command === 'serve') {
    const portIndex = args.indexOf('--port');
    const port = portIndex !== -1 && args[portIndex + 1] ? Number(args[portIndex + 1]) : 4000;
    const info = await serveProxy({ port });
    console.log(`Proxy server listening at ${info.url}`);
    console.log(`- OpenAI Chat Completions: ${info.url}/v1/chat/completions`);
    console.log(`- Models Endpoint:         ${info.url}/v1/models`);
    console.log(`- Usage Limit Endpoint:    ${info.url}/v1/usage`);
    console.log(`- Status Diagnostics:      ${info.url}/v1/status`);
    console.log(`- Statusline Endpoint:     ${info.url}/v1/statusline`);
    console.log(`- Health Check:            ${info.url}/health`);
    return;
  }

  const modelIndex = args.indexOf('--model');
  const model = modelIndex !== -1 ? args[modelIndex + 1] : undefined;

  const promptArgs = args.filter(
    (a, i) =>
      i !== providerIndex &&
      i !== providerIndex + 1 &&
      i !== modelIndex &&
      i !== modelIndex + 1 &&
      i !== sessionIndex &&
      i !== sessionIndex + 1 &&
      a !== '--json',
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
