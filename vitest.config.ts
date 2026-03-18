import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: "jsdom",
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
