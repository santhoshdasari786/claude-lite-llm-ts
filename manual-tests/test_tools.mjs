import { litellm, ClaudeSubscriptionProvider } from '../dist/index.js';

const claudeProvider = new ClaudeSubscriptionProvider();
litellm.custom_provider_map = [{ provider: 'claude_sub', custom_handler: claudeProvider }];

console.log('--- TESTING TOOL CALLING ---');
const response = await litellm.completion({
  model: 'claude_sub/sonnet',
  messages: [{ role: 'user', content: 'What is the weather in San Francisco right now?' }],
  tools: [
    {
      type: 'function',
      function: {
        name: 'get_current_weather',
        description: 'Get the current weather in a given location',
        parameters: {
          type: 'object',
          properties: {
            location: {
              type: 'string',
              description: 'The city and state, e.g. San Francisco, CA',
            },
            unit: { type: 'string', enum: ['celsius', 'fahrenheit'] },
          },
          required: ['location'],
        },
      },
    },
  ],
});

console.log('Finish Reason:', response.choices[0]?.finish_reason);
console.log('Message:', JSON.stringify(response.choices[0]?.message, null, 2));
console.log('--- TOOL CALL COMPLETED ---');
