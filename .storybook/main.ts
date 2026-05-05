import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import type { StorybookConfig } from "@storybook/nextjs-vite";

const config: StorybookConfig = {
  stories: ["../src/**/*.mdx", "../src/**/*.stories.@(js|jsx|mjs|ts|tsx)"],
  addons: ["@storybook/addon-themes", "@storybook/addon-mcp"],
  framework: {
    name: "@storybook/nextjs-vite",
    options: {},
  },
  viteFinal(config, { configType }) {
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
