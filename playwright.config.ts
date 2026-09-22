import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60000,
  expect: { timeout: 10000 },
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: process.env.TEST_BASE_URL ?? "http://127.0.0.1:3000",
    viewport: { width: 1440, height: 1000 },
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium-voice",
      testMatch: "**/voice.spec.ts",
      use: { browserName: "chromium" },
    },
    {
      name: "chromium",
      testIgnore: "**/voice.spec.ts",
      use: { browserName: "chromium" },
    },
    {
      name: "webkit-touch",
      testMatch: [
        "**/portable.spec.ts",
        "**/clarity.spec.ts",
        "**/features.spec.ts",
      ],
      use: { browserName: "webkit" },
    },
  ],
  reporter: "list",
  outputDir: "output/playwright/test-results",
});
