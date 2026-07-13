import path from 'node:path';
import { defineConfig } from 'vitest/config';

// Unit tests only — Playwright owns e2e/ (see playwright.config.ts).
export default defineConfig({
  resolve: {
    alias: { '@': path.resolve(__dirname) },
  },
  test: {
    include: ['tests/unit/**/*.test.ts'],
  },
});
