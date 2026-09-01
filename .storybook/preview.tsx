import type { Preview } from "@storybook/react";
import { MINIMAL_VIEWPORTS } from "storybook/viewport";
import "../src/app/globals.css";
import { AppChrome } from "../src/components/AppChrome";

// All global style decisions (the app font + page surface) live in AppChrome;
// the decorator below wraps every story in it so stories render with the same
// chrome as the live site. It deliberately adds NO padding of its own: a story
// that pins a viewport width expects that width to reach the component
// untouched, and a gutter here would silently subtract from every one of them.
// Stories that want breathing room get it from `layout: "padded"`.

/**
 * Story canvas widths, named for the surface each one stands for rather than
 * the number. A story that must render at a given width pins one of these via
 * `globals: { viewport: { value: "panel" } }` instead of wrapping itself in a
 * fixed-width `<div>` — see .claude/docs/storybook.md.
 *
 * `options` REPLACES Storybook's built-in set rather than merging with it,
 * hence the explicit spread of MINIMAL_VIEWPORTS.
 */
const viewportOptions = {
  control: {
    name: "Control (288)",
    styles: { width: "288px", height: "720px" },
    type: "mobile",
  },
  card: {
    name: "Card (320)",
    styles: { width: "320px", height: "600px" },
    type: "mobile",
  },
  column: {
    name: "Cooking column (360)",
    styles: { width: "360px", height: "800px" },
    type: "mobile",
  },
  phone: {
    name: "Phone (390)",
    styles: { width: "390px", height: "844px" },
    type: "mobile",
  },
  sheet: {
    name: "Sheet (420)",
    styles: { width: "420px", height: "640px" },
    type: "mobile",
  },
  panel: {
    name: "Panel (480)",
    styles: { width: "480px", height: "900px" },
    type: "tablet",
  },
  editor: {
    name: "Editor (640)",
    styles: { width: "640px", height: "700px" },
    type: "tablet",
  },
  page: {
    name: "Page (760)",
    styles: { width: "760px", height: "1000px" },
    type: "desktop",
  },
  ...MINIMAL_VIEWPORTS,
} as const;

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
    viewport: { options: viewportOptions },
  },
  decorators: [
    (Story) => (
      <AppChrome>
        <Story />
      </AppChrome>
    ),
  ],
};

export default preview;
