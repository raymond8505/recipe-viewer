import { cookies } from "next/headers";
import { SESSION_COOKIE, getExpectedToken } from "@/lib/auth";
import { env } from "@/env";

export async function POST(request: Request) {
  const { password } = await request.json();

  if (password !== env.AUTH_PASSWORD) {
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
