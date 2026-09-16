import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import AuthButton from "@/components/AuthButton";
import { getIsLoggedIn } from "@/lib/auth";
import { canCurateNutrition } from "@/lib/devAccess";
import {
  bodyFont,
  headingFont,
  APP_SHELL_CLASS,
  APP_SURFACE_CLASS,
} from "@/components/AppChrome";

export const metadata: Metadata = {
  title: {
    default: "Recipe Viewer",
    template: "%s | Recipe Viewer",
  },
  description: "Browse and share recipes",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const isLoggedIn = await getIsLoggedIn();
  // The catalog manager is open in local dev; without matching the nav link to
  // that, /ingredients would work but be undiscoverable.
  const showIngredientsLink = canCurateNutrition(isLoggedIn);

  return (
    <html lang="en" className={`${bodyFont.variable} ${headingFont.variable}`}>
      <body
        className={`${bodyFont.className} ${APP_SURFACE_CLASS} ${APP_SHELL_CLASS}`}
      >
        <header className="bg-card border-b border-gray-200 shrink-0 z-10">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
            <Link
              href="/"
              className="font-heading font-normal text-lg text-brand hover:text-brand/80 transition"
            >
              RECIPES
            </Link>
            <div className="flex items-center gap-4">
              {showIngredientsLink && (
                <Link
                  href="/ingredients"
                  className="text-sm text-muted-foreground hover:text-foreground transition"
                >
                  Ingredients
                </Link>
              )}
              <AuthButton isLoggedIn={isLoggedIn} />
            </div>
          </div>
        </header>
        {/* The site's scrollport, and the only element below <body> with a
            definite height (`flex-1` against the body's `h-dvh`). That is what
            lets a page fill the screen by saying `flex-1 min-h-0` instead of
            subtracting chrome it cannot measure. An ordinary page's content
            simply flows and scrolls here; a page whose root claims the height
            leaves nothing to scroll, so only that page's own box does.
            This element centres the page itself — `items-center` plus a width
            cap on whatever the page renders — rather than wrapping it in a
            centring div. A wrapper there would be auto-height and therefore
            indefinite, and every height below it would stop resolving; keeping
            the scrollport full-width also leaves its scrollbar at the window
            edge rather than inset at the column's. */}
        <main className="flex min-h-0 flex-1 flex-col items-center overflow-auto px-4 sm:px-6 py-8 [&>*]:w-full [&>*]:max-w-6xl">
          {children}
        </main>
      </body>
    </html>
  );
}
