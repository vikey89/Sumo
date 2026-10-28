import { defineConfig, devices } from '@playwright/test';

/** A port of its own, so the smoke test never touches a `sumo` the developer is running. */
const PORT = 3107;

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: 'retain-on-failure',
  },
  // The arena is a Babylon.js scene: headless Chromium falls back to SwiftShader (about two
  // frames a second, which starves input), so render with Metal like a real browser does.
  timeout: 60_000,
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: { args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] },
      },
    },
  ],
  webServer: {
    // Built beforehand: `npm run build` then `cargo build --release --manifest-path server/Cargo.toml`.
    command: `server/target/release/sumo serve --no-open --no-notify --port ${PORT}`,
    url: `http://127.0.0.1:${PORT}/health`,
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
