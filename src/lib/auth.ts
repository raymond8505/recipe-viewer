import { createHash } from "crypto";
import { cookies } from "next/headers";
import { env } from "@/env";

export const SESSION_COOKIE = "auth_session";

function computeSessionToken(): string {
  return createHash("sha256").update(`auth:${env.AUTH_PASSWORD}`).digest("hex");
}

export async function getIsLoggedIn(): Promise<boolean> {
  const jar = await cookies();
  return jar.get(SESSION_COOKIE)?.value === computeSessionToken();
}

export function getExpectedToken(): string {
  return computeSessionToken();
}
