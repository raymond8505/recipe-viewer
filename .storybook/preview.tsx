import type { Preview } from "@storybook/react";
import "../src/app/globals.css";
import { AppChrome } from "../src/components/AppChrome";

// All global style decisions (the app font + page surface) live in AppChrome;
// the decorator below wraps every story in it so stories render with the same
// chrome as the live site.
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
      <AppChrome className="p-6">
        <Story />
      </AppChrome>
    ),
  ],
};

export default preview;
