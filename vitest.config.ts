import { defineConfig } from "vitest/config";
import { playwright } from "@vitest/browser-playwright";

export default defineConfig({
  test: {
    globals: true,
    coverage: {
      include: ["src/**/*.ts"],
      exclude: ["src/index.ts", "src/types.ts"],
    },
    projects: [
      {
        test: {
          name: "unit",
          include: ["tests/**/*.test.ts"],
          exclude: ["tests/**/*.browser.test.ts"],
          environment: "node",
        },
      },
      {
        test: {
          name: "browser",
          include: ["tests/**/*.browser.test.ts"],
          browser: {
            enabled: true,
            headless: true,
            provider: playwright({
              launchOptions: {
                args: ["--autoplay-policy=no-user-gesture-required"],
              },
            }),
            instances: [{ browser: "chromium" }],
          },
        },
      },
    ],
  },
});
