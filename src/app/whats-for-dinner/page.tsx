import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getIsLoggedIn } from "@/lib/auth";
import WFDMode from "@/components/whats-for-dinner/WFDMode";

export const metadata: Metadata = {
  title: "What's for Dinner? — Recipe Viewer",
};

// Logged-in-only tool — the backing /api/whats-for-dinner endpoint requires a
// session, so anonymous visitors are sent back to the public catalog.
export default async function WFDPage() {
  if (!(await getIsLoggedIn())) redirect("/");
  return <WFDMode />;
}
