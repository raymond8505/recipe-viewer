import type { Metadata } from "next";
import { Inter } from "next/font/google";
import Link from "next/link";
import "./globals.css";
import WindowApiProvider from "@/components/WindowApiProvider";
import AuthButton from "@/components/AuthButton";
import { getIsLoggedIn } from "@/lib/auth";
import { APP_SURFACE_CLASS } from "@/components/AppChrome";

// Inter is the app font; expose it as --font-sans so shadcn's `font-sans`
// token (used by ui/* components) resolves to the same family. The loader
// call must stay at this module's top (Next static-analysis constraint); the
// page-surface classes are centralized in AppChrome and shared with Storybook.
const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });

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

  return (
    <html lang="en" className={inter.variable}>
      <body className={`${inter.className} ${APP_SURFACE_CLASS}`}>
        <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
            <Link
              href="/"
              className="text-lg font-bold text-orange-500 hover:text-orange-600 transition"
            >
              🍳 Recipes
            </Link>
            <AuthButton isLoggedIn={isLoggedIn} />
          </div>
        </header>
        <WindowApiProvider />
        <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8">{children}</main>
      </body>
    </html>
  );
}
