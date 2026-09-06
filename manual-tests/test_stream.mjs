import { litellm, ClaudeSubscriptionProvider } from '../dist/index.js';

const claudeProvider = new ClaudeSubscriptionProvider();
litellm.custom_provider_map = [{ provider: 'claude_sub', custom_handler: claudeProvider }];

console.log('--- TESTING LIVE STREAMING ---');
const stream = await litellm.completion({
  model: 'claude_sub/sonnet',
  messages: [{ role: 'user', content: 'Count from 1 to 4 with commas.' }],
  stream: true,
});

for await (const chunk of stream) {
  const content = chunk.choices[0]?.delta?.content;
  if (content) {
    process.stdout.write(`[CHUNK: "${content}"] `);
  }
}
console.log('\n--- STREAM COMPLETED ---');
