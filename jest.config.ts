import type { Config } from "jest";

const config: Config = {
  testEnvironment: "node",
  transform: {
    "^.+\\.tsx?$": ["ts-jest", { tsconfig: { module: "CommonJS" } }],
  },
  testMatch: ["**/tests/api/**/*.test.ts"],
  testTimeout: 30000,
};

export default config;
