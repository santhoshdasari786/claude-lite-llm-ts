# @santhoshdasari786/claude-lite-llm-ts

[![CI](https://github.com/santhoshdasari786/claude-lite-llm-ts/actions/workflows/ci.yaml/badge.svg)](https://github.com/santhoshdasari786/claude-lite-llm-ts/actions/workflows/ci.yaml)
[![npm version](https://img.shields.io/npm/v/@santhoshdasari786/claude-lite-llm-ts.svg)](https://www.npmjs.com/package/@santhoshdasari786/claude-lite-llm-ts)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
![Node Version](https://img.shields.io/node/v/@santhoshdasari786/claude-lite-llm-ts)

This is a library for claude wrapper for litellm that can be used to use claude subscriptions programatically

---

## Features

- 📦 **Dual ESM & CommonJS**: Ships with native ESM and CommonJS bundles with TypeScript declarations.
- ⚡ **Zero-Config Bundler**: Powered by `tsup` for rapid tree-shaking builds.
- 🧪 **Vitest**: Fast, in-memory unit tests with v8 code coverage reports.
- 🧹 **Modern Tooling**: ESLint Flat Config (`typescript-eslint`), Prettier formatting, and optional Husky pre-commit hooks.
- 🚀 **Automated CI/CD**: GitHub Actions CI matrix across Node.js versions, tag-triggered automated publishing with signed provenance.
- 🔒 **Public & Private Support**: Configured for public npm registry or scoped private/restricted distribution.

---

## Installation

```bash
# npm
npm install @santhoshdasari786/claude-lite-llm-ts

# pnpm
pnpm add @santhoshdasari786/claude-lite-llm-ts

# yarn
yarn add @santhoshdasari786/claude-lite-llm-ts

# bun
bun add @santhoshdasari786/claude-lite-llm-ts
```

---

## Quick Start

```typescript
import { MemoryCache } from '@santhoshdasari786/claude-lite-llm-ts';

// Create a cache instance with a 60-second TTL
const cache = new MemoryCache<string>({ ttlMs: 60000, maxSize: 500 });

// Set and retrieve values
cache.set('session:123', 'active');
const status = cache.get('session:123');
console.log('Status:', status); // 'active'

// Inspect cache stats
console.log(cache.getStats());
// { size: 1, hits: 1, misses: 0, hitRatio: 1 }
```

---

## Development

```bash
# Install dependencies
npm install

# Start development mode with tsup watch
npm run dev

# Run test suite
npm test

# Run tests with code coverage
npm run test:coverage

# Lint and check formatting
npm run lint
npm run format:check

# Type check
npm run typecheck

# Build distribution files (dist/)
npm run build
```

---

## Publishing & Releasing

Publishing is fully automated via GitHub Actions:

1. Bump the version and create a semver git tag:
   ```bash
   git tag v0.1.0
   git push origin v0.1.0
   ```
2. The `Publish package` workflow will run linting, tests, build, and publish:
   - **Public npm**: Published with `--access public` and signed cryptographic provenance.
   - **Private / Restricted**: Published with `--access restricted` using your repository's `NPM_TOKEN` secret.

---

## License

[MIT](LICENSE) © 2026 D S Santhosh
