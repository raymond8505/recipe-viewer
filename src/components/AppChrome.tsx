import { Figtree, Source_Serif_4 } from "next/font/google";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

// Single source of truth for the app's global "chrome" style decisions — the
// app fonts and the page surface (background + min height). Consumed by the real
// site (src/app/layout.tsx) and by Storybook (.storybook/preview.tsx) so every
// surface renders identically in both. The next/font loaders are called once here
// (top-level module calls Next's static analysis can follow), not per entry.

/** The body font, exposed as `--font-sans` — the variable shadcn's
 *  `font-sans` token resolves to (see globals.css @theme). */
export const bodyFont = Figtree({ subsets: ["latin"], variable: "--font-sans" });

/** The heading font, exposed as `--font-heading` — consumed by the
 *  `font-heading` token and the base-layer h1–h6 rule in globals.css. */
export const headingFont = Source_Serif_4({
  subsets: ["latin"],
  variable: "--font-heading",
  axes: ["opsz"],
});

/** Background + min height for the page surface (site: <body>). */
export const APP_SURFACE_CLASS = "bg-background min-h-screen";

export interface AppChromeProps {
  children: ReactNode;
  className?: string;
}

/**
 * Applies the global chrome (font variables + family + page surface) to a single
 * wrapper element. Used where there is no <html>/<body> split to apply it
 * across — e.g. the Storybook preview decorator.
 */
export function AppChrome({ children, className }: AppChromeProps) {
  return (
    <div
      className={cn(
        bodyFont.variable,
        headingFont.variable,
        bodyFont.className,
        APP_SURFACE_CLASS,
        className,
      )}
    >
      {children}
    </div>
  );
}
