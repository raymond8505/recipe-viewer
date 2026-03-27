import { cookies } from "next/headers";
import { SESSION_COOKIE, getExpectedToken } from "@/lib/auth";

export async function POST(request: Request) {
  const { password } = await request.json();

  const expected = getExpectedToken();
  if (!expected) {
    return new Response("AUTH_PASSWORD is not configured", { status: 503 });
  }

  if (password !== process.env.AUTH_PASSWORD) {
    return new Response("Incorrect password", { status: 401 });
  }

  const jar = await cookies();
  jar.set(SESSION_COOKIE, expected, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 7, // 7 days
    path: "/",
  });

  return new Response(null, { status: 200 });
}
