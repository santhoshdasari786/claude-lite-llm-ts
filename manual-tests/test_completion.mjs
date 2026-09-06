import { litellm, ClaudeSubscriptionProvider } from '../dist/index.js';

const claudeProvider = new ClaudeSubscriptionProvider();
litellm.custom_provider_map = [{ provider: 'claude_sub', custom_handler: claudeProvider }];

console.log('--- TESTING BASIC COMPLETION ---');
const response = await litellm.completion({
  model: 'claude_sub/sonnet',
  messages: [{ role: 'user', content: 'Say: Hello LiteLLM with Claude Subscription!' }],
});

console.log('Response:', response.choices[0]?.message.content);
console.log('Usage:', response.usage);
console.log('--- BASIC COMPLETION COMPLETED ---');
