import type { Preview } from "@storybook/react";
import { Inter } from "next/font/google";
import "../src/app/globals.css";
import { AppChrome } from "../src/components/AppChrome";

// Same top-level loader call as src/app/layout.tsx (Next static-analysis
// constraint — see AppChrome). Every other global style decision (background,
// font application) is centralized in AppChrome and reused via the decorator
// below so stories render with the same chrome as the live site.
const appFont = Inter({ subsets: ["latin"], variable: "--font-sans" });

const preview: Preview = {
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/,
      },
    },
    nextjs: {
      appDirectory: true,
    },
  },
  decorators: [
    (Story) => (
      <AppChrome font={appFont} className="p-6">
        <Story />
      </AppChrome>
    ),
  ],
};

export default preview;
