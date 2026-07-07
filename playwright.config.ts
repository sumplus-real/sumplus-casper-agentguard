import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30000,
  use: {
    baseURL: "http://localhost:3000",
    headless: true,
  },
  reporter: [["list"], ["json", { outputFile: "tests/results/e2e-results.json" }]],
});
