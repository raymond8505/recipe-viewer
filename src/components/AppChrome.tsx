import type { NextFontWithVariable } from "next/dist/compiled/@next/font";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

// Single source of truth for the app's global "chrome" style decisions —
// the page surface (background + min height) and how the app font is applied.
// Consumed by the real site (src/app/layout.tsx) and by Storybook
// (.storybook/preview.tsx) so every surface renders identically in both.
//
// Note: the `next/font` loader itself (`Inter(...)`) must be called at the
// module top of each *compiled entry* (layout.tsx, preview.tsx) — Next's
// static analysis can't follow it through a shared module — so the resulting
// font is passed in here rather than created here.

/** Background + min height for the page surface (site: <body>). */
export const APP_SURFACE_CLASS = "bg-gray-50 min-h-screen";

export interface AppChromeProps {
  /** The app font from a top-level `next/font` loader call. */
  font: NextFontWithVariable;
  children: ReactNode;
  className?: string;
}

/**
 * Applies the global chrome (font variable + family + page surface) to a
 * single wrapper element. Used where there is no <html>/<body> split to apply
 * it across — e.g. the Storybook preview decorator.
 */
export function AppChrome({ font, children, className }: AppChromeProps) {
  return (
    <div className={cn(font.variable, font.className, APP_SURFACE_CLASS, className)}>
      {children}
    </div>
  );
}
