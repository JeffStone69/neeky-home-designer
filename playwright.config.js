import { defineConfig } from "@playwright/test";

const port = 4173;

export default defineConfig({
  testDir: "e2e",
  timeout: 60000,
  expect: { timeout: 10000 },
  fullyParallel: false,
  retries: 0,
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    viewport: { width: 1280, height: 800 },
  },
  webServer: {
    command: "python3 start.sh",
    env: { ...process.env, PORT: String(port) },
    url: `http://127.0.0.1:${port}/`,
    reuseExistingServer: !process.env.CI,
    timeout: 15000,
  },
});
