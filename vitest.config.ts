import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "node",
    // workers/** has its own deps and runs under node:test, not vitest.
    exclude: ["**/node_modules/**", "workers/**"],
  },
  resolve: {
    alias: [
      // Longest-first: "@justcheckingmate/engine" also starts with "@", so a
      // bare "@" alias declared first would swallow it.
      {
        find: /^@justcheckingmate\/engine$/,
        replacement: path.resolve(__dirname, "packages/engine/src/index.ts"),
      },
      {
        find: /^@justcheckingmate\/engine\/(.*)$/,
        replacement: path.resolve(__dirname, "packages/engine/src") + "/$1",
      },
      { find: /^@\/(.*)$/, replacement: path.resolve(__dirname, ".") + "/$1" },
    ],
  },
});
