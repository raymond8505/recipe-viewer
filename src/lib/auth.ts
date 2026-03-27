import { createHash } from "crypto";
import { cookies } from "next/headers";

export const SESSION_COOKIE = "auth_session";

function computeSessionToken(): string {
  const password = process.env.AUTH_PASSWORD;
  if (!password) return "";
  return createHash("sha256").update(`auth:${password}`).digest("hex");
}

export async function getIsLoggedIn(): Promise<boolean> {
  const expected = computeSessionToken();
  if (!expected) return false;
  const jar = await cookies();
  return jar.get(SESSION_COOKIE)?.value === expected;
}

export function getExpectedToken(): string {
  return computeSessionToken();
}
