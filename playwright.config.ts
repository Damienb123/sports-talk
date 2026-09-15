import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "tests/browser", workers: 1, timeout: 60000,
  use: { baseURL: "http://localhost:3101", channel: "msedge", trace: "retain-on-failure" },
  webServer: { command: "node --import tsx tests/browser/server.ts", url: "http://localhost:3101/auth/login", timeout: 120000, reuseExistingServer: false },
});
