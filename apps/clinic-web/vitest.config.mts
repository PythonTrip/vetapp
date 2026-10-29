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
    include: ["src/**/*.test.{ts,tsx}"],
    setupFiles: ["./src/test/setup.ts"],
  },
});
