/**
 * CodexSubscriptionProvider - Custom provider adapter for LiteLLM compatibility with Codex.
 */

import { randomUUID } from 'node:crypto';
import { CodexClient } from './codex-client.js';
import type {
  ChatCompletionChunk,
  ChatCompletionRequest,
  CodexClientOptions,
  CustomLLMHandler,
  Message,
  ModelResponse,
  ToolCall,
} from './types.js';

export interface CodexSubscriptionProviderOptions extends CodexClientOptions {
  /**
   * Optional custom CodexClient instance to use.
   */
  client?: CodexClient;
  /**
   * Optional provider name prefix to strip from model name (defaults to 'codex_sub').
   */
  providerPrefix?: string;
}

/**
 * LiteLLM custom provider handler for Codex subscription / API authentication.
 */
export class CodexSubscriptionProvider implements CustomLLMHandler {
  public readonly client: CodexClient;
  public readonly providerPrefix: string;

  constructor(options: CodexSubscriptionProviderOptions = {}) {
    this.client = options.client || new CodexClient(options);
    this.providerPrefix = options.providerPrefix || 'codex_sub';
  }

  /**
   * Normalizes model string by stripping provider prefix (e.g. 'codex_sub/o3-mini' -> 'o3-mini').
   */
  public cleanModelName(model: string): string {
    if (!model) return '';
    const prefix = `${this.providerPrefix}/`;
    if (model.startsWith(prefix)) {
      return model.slice(prefix.length);
    }
    if (model.startsWith('codex_lite/')) {
      return model.slice('codex_lite/'.length);
    }
    if (model.startsWith('codex-sub/')) {
      return model.slice('codex-sub/'.length);
    }
    if (model.startsWith('codex/')) {
      return model.slice('codex/'.length);
    }
    return model;
  }

  /**
   * Formats tool definitions and instructions into messages if OpenAI tools are provided.
   */
  private prepareMessagesAndSchema(params: ChatCompletionRequest): {
    messages: Message[];
    outputSchema?: Record<string, unknown>;
  } {
    const messages = [...(params.messages || [])];
    let outputSchema: Record<string, unknown> | undefined;

    // Structured output schema
    if (
      params.response_format?.type === 'json_schema' &&
      params.response_format.json_schema?.schema
    ) {
      outputSchema = params.response_format.json_schema.schema;
    }

    // OpenAI tool / function calling
    if (params.tools && Array.isArray(params.tools) && params.tools.length > 0) {
      const toolsDescription = JSON.stringify(
        params.tools.map((t) => ({
          name: t.function.name,
          description: t.function.description || '',
          parameters: t.function.parameters || {},
        })),
        null,
        2,
      );

      const toolInstructions = `
You have access to the following tools:
${toolsDescription}

If you need to call a tool, respond ONLY with a JSON object in this exact format:
{
  "tool_calls": [
    {
      "name": "<function_name>",
      "arguments": { <arguments> }
    }
  ]
}
If no tool call is needed, respond with standard text.
`;

      messages.unshift({
        role: 'system',
        content: toolInstructions.trim(),
      });
    }

    return { messages, outputSchema };
  }

  /**
   * Parses potential tool call JSON from model output.
   */
  public parseToolCalls(content: string): ToolCall[] | null {
    if (!content) return null;
    const trimmed = content.trim();

    // Check for direct JSON or markdown code block with JSON
    let jsonCandidate = trimmed;
    const codeBlockMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (codeBlockMatch && codeBlockMatch[1]) {
      jsonCandidate = codeBlockMatch[1].trim();
    }

    if (!jsonCandidate.startsWith('{') || !jsonCandidate.endsWith('}')) {
      return null;
    }

    try {
      const parsed = JSON.parse(jsonCandidate) as Record<string, unknown>;
      if (Array.isArray(parsed.tool_calls) && parsed.tool_calls.length > 0) {
        return parsed.tool_calls.map((call: Record<string, unknown>, index: number) => {
          const fn = (call.function || call) as Record<string, unknown>;
          const name = String(fn.name || '');
          const args =
            typeof fn.arguments === 'string' ? fn.arguments : JSON.stringify(fn.arguments || {});
          return {
            id: String(call.id || `call_${randomUUID().slice(0, 9)}_${index}`),
            type: 'function',
            function: {
              name,
              arguments: args,
            },
          };
        });
      }
    } catch {
      // not valid tool call json
    }

    return null;
  }

  /**
   * Executes completion conforming to LiteLLM's `custom_handler` interface.
   */
  public async completion(
    params: ChatCompletionRequest & { stream: true },
  ): Promise<AsyncIterable<ChatCompletionChunk>>;
  public async completion(
    params: ChatCompletionRequest & { stream?: false },
  ): Promise<ModelResponse>;
  public async completion(
    params: ChatCompletionRequest,
  ): Promise<ModelResponse | AsyncIterable<ChatCompletionChunk>>;
  public async completion(
    params: ChatCompletionRequest,
  ): Promise<ModelResponse | AsyncIterable<ChatCompletionChunk>> {
    if (params.stream) {
      return this.completionStream(params);
    }

    const modelName = this.cleanModelName(params.model);
    const { messages, outputSchema } = this.prepareMessagesAndSchema(params);

    const response = await this.client.completion(messages, {
      model: modelName,
      systemPrompt: params.system,
      outputSchema,
      timeoutMs: params.timeout,
    });

    const completionId = `chatcmpl-${randomUUID()}`;
    const created = Math.floor(Date.now() / 1000);

    const toolCalls = this.parseToolCalls(response.content);
    const finishReason = toolCalls && toolCalls.length > 0 ? 'tool_calls' : 'stop';

    return {
      id: completionId,
      object: 'chat.completion',
      created,
      model: params.model,
      choices: [
        {
          index: 0,
          message: {
            role: 'assistant',
            content: finishReason === 'tool_calls' ? null : response.content,
            ...(toolCalls && toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
          },
          finish_reason: finishReason,
        },
      ],
      usage: {
        prompt_tokens: response.usage.inputTokens,
        completion_tokens: response.usage.outputTokens,
        total_tokens: response.usage.totalTokens,
        total_cost_usd: response.usage.totalCostUsd,
      },
      session_id: response.sessionId,
      duration_ms: response.durationMs,
    };
  }

  /**
   * Real-time streaming iterator returning standard ChatCompletionChunk items.
   */
  public async *completionStream(
    params: ChatCompletionRequest,
  ): AsyncIterable<ChatCompletionChunk> {
    const modelName = this.cleanModelName(params.model);
    const { messages, outputSchema } = this.prepareMessagesAndSchema(params);

    const completionId = `chatcmpl-${randomUUID()}`;
    const created = Math.floor(Date.now() / 1000);

    const stream = this.client.completionStream(messages, {
      model: modelName,
      systemPrompt: params.system,
      outputSchema,
      timeoutMs: params.timeout,
    });

    let isFirst = true;

    for await (const chunk of stream) {
      if (chunk.type === 'delta') {
        const deltaRole = isFirst ? 'assistant' : undefined;
        isFirst = false;

        yield {
          id: completionId,
          object: 'chat.completion.chunk',
          created,
          model: params.model,
          choices: [
            {
              index: 0,
              delta: {
                ...(deltaRole ? { role: deltaRole } : {}),
                content: chunk.text,
              },
              finish_reason: null,
            },
          ],
        };
      } else if (chunk.type === 'final') {
        yield {
          id: completionId,
          object: 'chat.completion.chunk',
          created,
          model: params.model,
          choices: [
            {
              index: 0,
              delta: {},
              finish_reason: 'stop',
            },
          ],
          usage: chunk.usage
            ? {
                prompt_tokens: chunk.usage.inputTokens,
                completion_tokens: chunk.usage.outputTokens,
                total_tokens: chunk.usage.totalTokens,
                total_cost_usd: chunk.usage.totalCostUsd,
              }
            : undefined,
        };
      }
    }
  }

  /**
   * Parity alias for async completion.
   */
  public async acompletion(
    params: ChatCompletionRequest & { stream: true },
  ): Promise<AsyncIterable<ChatCompletionChunk>>;
  public async acompletion(
    params: ChatCompletionRequest & { stream?: false },
  ): Promise<ModelResponse>;
  public async acompletion(
    params: ChatCompletionRequest,
  ): Promise<ModelResponse | AsyncIterable<ChatCompletionChunk>>;
  public async acompletion(
    params: ChatCompletionRequest,
  ): Promise<ModelResponse | AsyncIterable<ChatCompletionChunk>> {
    if (params.stream) {
      return this.completion(params as ChatCompletionRequest & { stream: true });
    }
    return this.completion(params as ChatCompletionRequest & { stream?: false });
  }
}
