// Client-side wrappers for the /api/auth routes. UI components import from here
// instead of calling `fetch` directly so the network shape stays in one place
// and tests/stories can mock a single module.

export async function loginWithPassword(password: string): Promise<boolean> {
  const res = await fetch("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password }),
  });
  return res.ok;
}

export async function logout(): Promise<void> {
  await fetch("/api/auth/logout", { method: "POST" });
}
