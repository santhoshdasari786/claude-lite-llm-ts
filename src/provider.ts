/**
 * ClaudeSubscriptionProvider - Custom provider adapter for LiteLLM compatibility.
 */

import { randomUUID } from 'node:crypto';
import { ClaudeClient } from './client.js';
import type {
  ChatCompletionChunk,
  ChatCompletionRequest,
  ClaudeClientOptions,
  CustomLLMHandler,
  Message,
  ModelResponse,
  ToolCall,
} from './types.js';

export interface ClaudeSubscriptionProviderOptions extends ClaudeClientOptions {
  /**
   * Optional custom ClaudeClient instance to use.
   */
  client?: ClaudeClient;
  /**
   * Optional provider name prefix to strip from model name (defaults to 'claude_sub').
   */
  providerPrefix?: string;
}

/**
 * LiteLLM custom provider handler for Claude subscription authentication.
 */
export class ClaudeSubscriptionProvider implements CustomLLMHandler {
  public readonly client: ClaudeClient;
  public readonly providerPrefix: string;

  constructor(options: ClaudeSubscriptionProviderOptions = {}) {
    this.client = options.client || new ClaudeClient(options);
    this.providerPrefix = options.providerPrefix || 'claude_sub';
  }

  /**
   * Normalizes model string by stripping provider prefix (e.g., 'claude_sub/sonnet' -> 'sonnet').
   */
  public cleanModelName(model: string): string {
    if (!model) return '';
    const prefix = `${this.providerPrefix}/`;
    if (model.startsWith(prefix)) {
      return model.slice(prefix.length);
    }
    if (model.startsWith('claude-sub/')) {
      return model.slice('claude-sub/'.length);
    }
    return model;
  }

  /**
   * Formats tool definitions and instructions into messages if OpenAI tools are provided.
   */
  private prepareMessagesAndSchema(params: ChatCompletionRequest): {
    messages: Message[];
    jsonSchema?: Record<string, unknown>;
  } {
    const messages = [...(params.messages || [])];
    let jsonSchema: Record<string, unknown> | undefined;

    // Support structured output response_format
    if (
      params.response_format?.type === 'json_schema' &&
      params.response_format.json_schema?.schema
    ) {
      jsonSchema = params.response_format.json_schema.schema;
    }

    // Support OpenAI function/tool calling
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

      // Prepend or inject tool instructions into system prompt
      const systemIndex = messages.findIndex((m) => m.role === 'system');
      if (systemIndex !== -1 && messages[systemIndex]) {
        messages[systemIndex] = {
          ...messages[systemIndex],
          content: `${messages[systemIndex].content}\n\n${toolInstructions}`,
        };
      } else {
        messages.unshift({
          role: 'system',
          content: toolInstructions.trim(),
        });
      }
    }

    return { messages, jsonSchema };
  }

  /**
   * Attempts to parse tool calls from the assistant response.
   */
  private extractToolCalls(content: string): ToolCall[] | null {
    const trimmed = content.trim();
    let jsonToParse = trimmed;

    // Check for ```json ... ``` markdown fence
    const match = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    if (match && match[1]) {
      jsonToParse = match[1].trim();
    }

    try {
      const parsed = JSON.parse(jsonToParse);
      if (parsed && typeof parsed === 'object') {
        const rawCalls = parsed.tool_calls || (parsed.name ? [parsed] : null);
        if (Array.isArray(rawCalls) && rawCalls.length > 0) {
          const toolCalls: ToolCall[] = [];
          for (const call of rawCalls) {
            if (call.name) {
              toolCalls.push({
                id: `call_${randomUUID().replace(/-/g, '').slice(0, 9)}`,
                type: 'function',
                function: {
                  name: String(call.name),
                  arguments:
                    typeof call.arguments === 'string'
                      ? call.arguments
                      : JSON.stringify(call.arguments || {}),
                },
              });
            }
          }
          if (toolCalls.length > 0) {
            return toolCalls;
          }
        }
      }
    } catch {
      // Not a JSON tool call
    }

    return null;
  }

  /**
   * Executes real-time streaming completion yielding OpenAI/LiteLLM ChatCompletionChunk objects.
   */
  public async *completionStream(
    params: ChatCompletionRequest,
  ): AsyncIterable<ChatCompletionChunk> {
    const rawModel = params.model || '';
    const cleanModel = this.cleanModelName(rawModel);
    const { messages, jsonSchema } = this.prepareMessagesAndSchema(params);
    const timeoutMs = params.timeout ? params.timeout * 1000 : undefined;

    const stream = this.client.completionStream(messages, {
      model: cleanModel || undefined,
      jsonSchema,
      timeoutMs,
    });

    const completionId = `chatcmpl-${randomUUID()}`;
    const created = Math.floor(Date.now() / 1000);

    for await (const chunk of stream) {
      if (chunk.type === 'delta' && chunk.text) {
        yield {
          id: completionId,
          object: 'chat.completion.chunk',
          created,
          model: cleanModel || rawModel || 'claude',
          choices: [
            {
              index: 0,
              delta: { content: chunk.text },
              finish_reason: null,
            },
          ],
        };
      } else if (chunk.type === 'final') {
        yield {
          id: completionId,
          object: 'chat.completion.chunk',
          created,
          model: cleanModel || rawModel || 'claude',
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
   * Executes completion conforming to LiteLLM / OpenAI custom provider standard.
   */
  public completion(
    params: ChatCompletionRequest & { stream: true },
  ): Promise<AsyncIterable<ChatCompletionChunk>>;
  public completion(params: ChatCompletionRequest & { stream?: false }): Promise<ModelResponse>;
  public completion(
    params: ChatCompletionRequest,
  ): Promise<ModelResponse | AsyncIterable<ChatCompletionChunk>>;
  public async completion(
    params: ChatCompletionRequest,
  ): Promise<ModelResponse | AsyncIterable<ChatCompletionChunk>> {
    if (params.stream) {
      return this.completionStream(params);
    }

    const rawModel = params.model || '';
    const cleanModel = this.cleanModelName(rawModel);
    const { messages, jsonSchema } = this.prepareMessagesAndSchema(params);
    const timeoutMs = params.timeout ? params.timeout * 1000 : undefined;

    const res = await this.client.completion(messages, {
      model: cleanModel || undefined,
      jsonSchema,
      timeoutMs,
    });

    const created = Math.floor(Date.now() / 1000);
    const completionId = `chatcmpl-${randomUUID()}`;

    const toolCalls = this.extractToolCalls(res.content);
    const hasToolCalls = toolCalls !== null && toolCalls.length > 0;

    return {
      id: completionId,
      object: 'chat.completion',
      created,
      model: cleanModel || rawModel || 'claude',
      choices: [
        {
          index: 0,
          message: {
            role: 'assistant',
            content: hasToolCalls ? null : res.content,
            tool_calls: hasToolCalls ? toolCalls : undefined,
          },
          finish_reason: hasToolCalls ? 'tool_calls' : 'stop',
        },
      ],
      usage: {
        prompt_tokens: res.usage.inputTokens,
        completion_tokens: res.usage.outputTokens,
        total_tokens: res.usage.totalTokens,
        total_cost_usd: res.usage.totalCostUsd,
      },
      session_id: res.sessionId,
      duration_ms: res.durationMs,
    };
  }

  /**
   * Async completion alias for LiteLLM python / acompletion parity.
   */
  public acompletion(
    params: ChatCompletionRequest & { stream: true },
  ): Promise<AsyncIterable<ChatCompletionChunk>>;
  public acompletion(params: ChatCompletionRequest & { stream?: false }): Promise<ModelResponse>;
  public acompletion(
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
