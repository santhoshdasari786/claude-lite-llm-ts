import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.{test,spec}.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'lcov', 'html'],
      exclude: [
        'dist/**',
        'manual-tests/**',
        'src/bin.ts',
        'src/types.ts',
        '**/*.d.ts',
        '**/*.test.ts',
        '**/*.spec.ts',
        'tsup.config.ts',
        'vitest.config.ts',
        'eslint.config.js',
      ],
      thresholds: {
        lines: 50,
        functions: 50,
        branches: 40,
        statements: 50,
      },
    },
  },
});
