import { Inter } from "next/font/google";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

// Single source of truth for the app's global "chrome" style decisions — the
// app font and the page surface (background + min height). Consumed by the real
// site (src/app/layout.tsx) and by Storybook (.storybook/preview.tsx) so every
// surface renders identically in both. The next/font loader is called once here
// (a top-level module call Next's static analysis can follow), not per entry.

/** The app font, exposed as `--font-sans` — the variable shadcn's
 *  `font-sans`/`font-heading` tokens resolve to (see globals.css @theme). */
export const appFont = Inter({ subsets: ["latin"], variable: "--font-sans" });

/** Background + min height for the page surface (site: <body>). */
export const APP_SURFACE_CLASS = "bg-gray-50 min-h-screen";

export interface AppChromeProps {
  children: ReactNode;
  className?: string;
}

/**
 * Applies the global chrome (font variable + family + page surface) to a single
 * wrapper element. Used where there is no <html>/<body> split to apply it
 * across — e.g. the Storybook preview decorator.
 */
export function AppChrome({ children, className }: AppChromeProps) {
  return (
    <div className={cn(appFont.variable, appFont.className, APP_SURFACE_CLASS, className)}>
      {children}
    </div>
  );
}
