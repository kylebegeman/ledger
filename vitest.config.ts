import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Windows runners spawn Git and write files several times slower than macOS and Linux, and
    // their speed varies from run to run, so tests there get the 30 second allowance the Git-heavy
    // tests already carry. Other platforms keep the default, so a slow test still shows up.
    testTimeout: process.platform === "win32" ? 30_000 : 5_000,
  },
});
