import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: "jsdom",
    env: { SKIP_ENV_VALIDATION: "1" },
    // Restore vi.stubEnv between tests. The dev-access bypass (src/lib/devAccess.ts)
    // is gated on NODE_ENV, so a stub leaking out of one test could silently open
    // the door in another and make an auth assertion pass for the wrong reason.
    unstubEnvs: true,
    setupFiles: ["./src/__tests__/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
    alias: {
      "next/navigation": path.resolve(
        __dirname,
        "src/__tests__/__mocks__/next-navigation.ts"
      ),
      "next/image": path.resolve(
        __dirname,
        "src/__tests__/__mocks__/next-image.tsx"
      ),
      "next/link": path.resolve(
        __dirname,
        "src/__tests__/__mocks__/next-link.tsx"
      ),
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
