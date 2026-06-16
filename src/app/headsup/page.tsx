import { redirect } from "next/navigation";
import { getIsLoggedIn } from "@/lib/auth";
import HeadsUpMode from "@/components/headsup/HeadsUpMode";

// Logged-in-only tool — the backing /api/headsup/search endpoint requires a
// session, so anonymous visitors are sent back to the public catalog. This is a
// server component (gate runs before render); HeadsUpMode is the client island.
export default async function HeadsUpPage() {
  if (!(await getIsLoggedIn())) redirect("/");
  return <HeadsUpMode />;
}
