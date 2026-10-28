/// <reference types="vitest/config" />
import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
  },
  test: {
    environment: 'happy-dom',
    // Unit tests only: the Playwright smoke test in e2e/ runs with `npm run e2e`.
    include: ['src/**/*.test.ts'],
    restoreMocks: true,
  },
});
