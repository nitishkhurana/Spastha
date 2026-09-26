import { defineConfig, devices } from '@playwright/test';

// index.html is loaded directly via file:// — it's a zero-build static
// page, so there's no dev server to start. Running from file:// also
// means the AI proxy (PROXY_URL) is unreachable (different origin, by
// design — see proxy/worker.js's origin check), so these tests always
// exercise the deterministic demo-mode fallback rather than hitting
// real paid APIs. That's intentional: fast, repeatable, no quota burn.
export default defineConfig({
  testDir: './test/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: 'list',
  use: {
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
});
