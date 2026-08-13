import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import WindowApiProvider from "@/components/WindowApiProvider";
import AuthButton from "@/components/AuthButton";
import { getIsLoggedIn } from "@/lib/auth";
import { canCurateNutrition } from "@/lib/devAccess";
import {
  bodyFont,
  headingFont,
  APP_SURFACE_CLASS,
} from "@/components/AppChrome";

export const metadata: Metadata = {
  title: {
    default: "Recipe Viewer",
    template: "%s | Recipe Viewer",
  },
  description: "Browse and share recipes",
  other: {
    "x-agent-api": "window.recipeTools",
  },
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
      <body className={`${bodyFont.className} ${APP_SURFACE_CLASS}`}>
        <header className="bg-card border-b border-gray-200 sticky top-0 z-10">
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
        <WindowApiProvider />
        <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8">{children}</main>
      </body>
    </html>
  );
}
