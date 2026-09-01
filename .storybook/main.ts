import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import type { StorybookConfig } from "@storybook/nextjs-vite";

const config: StorybookConfig = {
  stories: [
    "../src/**/*.mdx",
    // Top-level component stories (directly under src/components)
    "../src/components/*.stories.@(js|jsx|mjs|ts|tsx)",
    // Nested component stories.
    "../src/components/**/*.stories.@(js|jsx|mjs|ts|tsx)",
  ],
  addons: ["@storybook/addon-themes", "@storybook/addon-mcp", "@storybook/addon-a11y"],
  framework: {
    name: "@storybook/nextjs-vite",
    options: {},
  },
  viteFinal(config, { configType }) {
    // tsconfig excludes **/*.stories.tsx (a tsc-perf choice), which also removes
    // them from vite-tsconfig-paths' file scope — so `@/…` imports inside story
    // files stop resolving. Define the alias explicitly here, mirroring
    // vitest.config.ts, to keep Storybook resolution independent of tsconfig scope.
    const srcDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../src");
    config.resolve ??= {};
    if (Array.isArray(config.resolve.alias)) {
      config.resolve.alias.push({ find: /^@\//, replacement: `${srcDir}/` });
    } else {
      config.resolve.alias = { ...config.resolve.alias, "@": srcDir };
    }
    if (configType === "DEVELOPMENT") {
      const certsDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "certs");
      const keyPath = path.join(certsDir, "localhost-key.pem");
      const certPath = path.join(certsDir, "localhost.pem");
      // certs are gitignored (*.pem) — a fresh checkout has none, and storybook
      // must still start (plain http) rather than crash on the read
      if (fs.existsSync(keyPath) && fs.existsSync(certPath)) {
        config.server ??= {};
        config.server.https = {
          key: fs.readFileSync(keyPath),
          cert: fs.readFileSync(certPath),
        };
      }
    }
    return config;
  },
};

export default config;
