import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import type { StorybookConfig } from "@storybook/nextjs-vite";

const config: StorybookConfig = {
  stories: [
    "../src/**/*.mdx",
    // Top-level component stories (directly under src/components)
    "../src/components/*.stories.@(js|jsx|mjs|ts|tsx)",
    // Nested component stories, excluding the hidden headsup / whats-for-dinner dirs.
    // Their code stays; only the stories are dropped from the Storybook index.
    "../src/components/!(headsup|whats-for-dinner)/**/*.stories.@(js|jsx|mjs|ts|tsx)",
  ],
  addons: ["@storybook/addon-themes", "@storybook/addon-mcp"],
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
      config.server ??= {};
      config.server.https = {
        key: fs.readFileSync(path.join(certsDir, "localhost-key.pem")),
        cert: fs.readFileSync(path.join(certsDir, "localhost.pem")),
      };
    }
    return config;
  },
};

export default config;
