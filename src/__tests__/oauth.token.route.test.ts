// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createHash } from "crypto";

vi.mock("@/env", () => ({
  env: {
    OAUTH_JWT_SECRET: "test-secret-must-be-at-least-32-characters-long!",
    MCP_PUBLIC_URL: "http://localhost:3000",
  },
}));

vi.mock("@/lib/supabase", () => ({ getSupabaseClient: vi.fn() }));

import { POST } from "@/app/api/oauth/token/route";
import { hashSecret, verifyAccessToken } from "@/lib/mcp/oauth";

function pkceChallenge(verifier: string): string {
  return createHash("sha256")
    .update(verifier)
    .digest()
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function formRequest(params: Record<string, string>) {
  return new Request("http://localhost/api/oauth/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params).toString(),
  });
}

/**
 * Tracks every (table, op, value) call so individual tests can assert what the
 * route did, while letting the route freely chain .insert().eq().single() etc.
 */
function makeSupabaseStub(
  rows: { oauth_codes?: Record<string, unknown> | null; oauth_refresh_tokens?: Record<string, unknown> | null },
) {
  const updates: { table: string; patch: Record<string, unknown> }[] = [];
  const inserts: { table: string; values: Record<string, unknown> }[] = [];

  const client = {
    from: vi.fn((table: string) => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi.fn().mockResolvedValue({
            data: rows[table as keyof typeof rows] ?? null,
            error: rows[table as keyof typeof rows] ? null : { message: "not found" },
          }),
        })),
      })),
      update: vi.fn((patch: Record<string, unknown>) => {
        updates.push({ table, patch });
        return { eq: vi.fn().mockResolvedValue({ error: null }) };
      }),
      insert: vi.fn((values: Record<string, unknown>) => {
        inserts.push({ table, values });
        return Promise.resolve({ error: null });
      }),
    })),
  };

  return { client, updates, inserts };
}

describe("POST /api/oauth/token", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects unsupported grant types", async () => {
    const { getSupabaseClient } = await import("@/lib/supabase");
    const { client } = makeSupabaseStub({});
    vi.mocked(getSupabaseClient).mockReturnValue(client as never);

    const res = await POST(formRequest({ grant_type: "client_credentials" }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("unsupported_grant_type");
  });

  describe("grant_type=authorization_code", () => {
    const verifier = "v".repeat(48);
    const challenge = pkceChallenge(verifier);
    const validCode = {
      code: "abc123",
      client_id: "client_test",
      redirect_uri: "http://127.0.0.1:33418/callback",
      code_challenge: challenge,
      code_challenge_method: "S256",
      scope: "mcp",
      expires_at: new Date(Date.now() + 60_000).toISOString(),
      consumed: false,
    };

    it("issues an access + refresh token on valid exchange", async () => {
      const { getSupabaseClient } = await import("@/lib/supabase");
      const { client, updates, inserts } = makeSupabaseStub({ oauth_codes: validCode });
      vi.mocked(getSupabaseClient).mockReturnValue(client as never);

      const res = await POST(
        formRequest({
          grant_type: "authorization_code",
          code: "abc123",
          client_id: "client_test",
          redirect_uri: validCode.redirect_uri,
          code_verifier: verifier,
        }),
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.token_type).toBe("Bearer");
      expect(body.access_token).toBeTruthy();
      expect(body.refresh_token).toBeTruthy();

      const claims = await verifyAccessToken(body.access_token);
      expect(claims.clientId).toBe("client_test");

      // Code marked consumed; refresh token persisted hashed.
      expect(updates.find((u) => u.table === "oauth_codes")?.patch.consumed).toBe(true);
      const refreshInsert = inserts.find((i) => i.table === "oauth_refresh_tokens");
      expect(refreshInsert?.values.token_hash).toBe(hashSecret(body.refresh_token));
    });

    it("rejects when PKCE verifier doesn't match", async () => {
      const { getSupabaseClient } = await import("@/lib/supabase");
      const { client } = makeSupabaseStub({ oauth_codes: validCode });
      vi.mocked(getSupabaseClient).mockReturnValue(client as never);

      const res = await POST(
        formRequest({
          grant_type: "authorization_code",
          code: "abc123",
          client_id: "client_test",
          redirect_uri: validCode.redirect_uri,
          code_verifier: "wrong".repeat(20),
        }),
      );
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe("invalid_grant");
    });

    it("rejects a consumed code", async () => {
      const { getSupabaseClient } = await import("@/lib/supabase");
      const { client } = makeSupabaseStub({ oauth_codes: { ...validCode, consumed: true } });
      vi.mocked(getSupabaseClient).mockReturnValue(client as never);

      const res = await POST(
        formRequest({
          grant_type: "authorization_code",
          code: "abc123",
          client_id: "client_test",
          redirect_uri: validCode.redirect_uri,
          code_verifier: verifier,
        }),
      );
      expect(res.status).toBe(400);
    });

    it("rejects an expired code", async () => {
      const { getSupabaseClient } = await import("@/lib/supabase");
      const { client } = makeSupabaseStub({
        oauth_codes: { ...validCode, expires_at: new Date(Date.now() - 1000).toISOString() },
      });
      vi.mocked(getSupabaseClient).mockReturnValue(client as never);

      const res = await POST(
        formRequest({
          grant_type: "authorization_code",
          code: "abc123",
          client_id: "client_test",
          redirect_uri: validCode.redirect_uri,
          code_verifier: verifier,
        }),
      );
      expect(res.status).toBe(400);
    });
  });

  describe("grant_type=refresh_token", () => {
    const refreshToken = "rt-fixture";

    it("rotates the refresh token and issues a new pair", async () => {
      const { getSupabaseClient } = await import("@/lib/supabase");
      const { client, updates } = makeSupabaseStub({
        oauth_refresh_tokens: {
          token_hash: hashSecret(refreshToken),
          client_id: "client_test",
          scope: "mcp",
          expires_at: new Date(Date.now() + 60_000).toISOString(),
          revoked: false,
        },
      });
      vi.mocked(getSupabaseClient).mockReturnValue(client as never);

      const res = await POST(
        formRequest({
          grant_type: "refresh_token",
          refresh_token: refreshToken,
          client_id: "client_test",
        }),
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.access_token).toBeTruthy();
      expect(body.refresh_token).toBeTruthy();
      expect(body.refresh_token).not.toBe(refreshToken);

      // The old token row gets revoked.
      const revoke = updates.find((u) => u.table === "oauth_refresh_tokens");
      expect(revoke?.patch.revoked).toBe(true);
    });

    it("rejects a revoked refresh token", async () => {
      const { getSupabaseClient } = await import("@/lib/supabase");
      const { client } = makeSupabaseStub({
        oauth_refresh_tokens: {
          token_hash: hashSecret(refreshToken),
          client_id: "client_test",
          scope: "mcp",
          expires_at: new Date(Date.now() + 60_000).toISOString(),
          revoked: true,
        },
      });
      vi.mocked(getSupabaseClient).mockReturnValue(client as never);

      const res = await POST(
        formRequest({
          grant_type: "refresh_token",
          refresh_token: refreshToken,
          client_id: "client_test",
        }),
      );
      expect(res.status).toBe(400);
    });
  });
});
