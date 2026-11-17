import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  cacheDir: ".tmp/vite",
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
    },
  },
  test: {
    environment: "happy-dom",
    include: ["tests/{unit,integration,secure}/**/*.test.{ts,tsx}"],
    setupFiles: ["./tests/_support/setup.ts"],
  },
});
