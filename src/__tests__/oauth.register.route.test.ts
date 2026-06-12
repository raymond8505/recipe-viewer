// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/env", () => ({
  env: {
    OAUTH_JWT_SECRET: "test-secret-must-be-at-least-32-characters-long!",
    MCP_PUBLIC_URL: "http://localhost:3000",
  },
}));

vi.mock("@/lib/supabase", () => ({ getSupabaseClient: vi.fn() }));

import { POST } from "@/app/api/oauth/register/route";

function jsonReq(body: object) {
  return new Request("http://localhost/api/oauth/register", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function makeSupabase(insertError: { message: string } | null = null) {
  return {
    from: vi.fn(() => ({
      insert: vi.fn().mockResolvedValue({ error: insertError }),
    })),
  };
}

describe("POST /api/oauth/register", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects when redirect_uris is missing", async () => {
    const { getSupabaseClient } = await import("@/lib/supabase");
    vi.mocked(getSupabaseClient).mockReturnValue(makeSupabase() as never);

    const res = await POST(jsonReq({ client_name: "Test" }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("invalid_redirect_uri");
  });

  it("rejects when token_endpoint_auth_method is not 'none'", async () => {
    const { getSupabaseClient } = await import("@/lib/supabase");
    vi.mocked(getSupabaseClient).mockReturnValue(makeSupabase() as never);

    const res = await POST(
      jsonReq({
        redirect_uris: ["http://127.0.0.1:33418/callback"],
        token_endpoint_auth_method: "client_secret_post",
      }),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("invalid_client_metadata");
  });

  it.each([
    ["http://127.0.0.1:33418/callback"],
    ["http://localhost:8080/cb"],
    ["http://[::1]:9090/cb"],
    ["https://claude.ai/api/mcp/auth_callback"],
    ["https://example.com:8443/oauth/callback"],
  ])("accepts %s", async (uri) => {
    const { getSupabaseClient } = await import("@/lib/supabase");
    vi.mocked(getSupabaseClient).mockReturnValue(makeSupabase() as never);

    const res = await POST(
      jsonReq({
        client_name: "Test",
        redirect_uris: [uri],
        token_endpoint_auth_method: "none",
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.client_id).toMatch(/^client_/);
    expect(body.redirect_uris).toEqual([uri]);
  });

  it.each([
    ["http://example.com/callback"],            // non-loopback HTTP — insecure transport
    ["ftp://example.com/cb"],                   // wrong scheme
    ["claude://callback"],                      // custom scheme — explicitly out of scope
    ["file:///tmp/cb"],                         // local file — abuse vector
    ["not a uri"],                              // unparseable
  ])("rejects %s", async (uri) => {
    const { getSupabaseClient } = await import("@/lib/supabase");
    vi.mocked(getSupabaseClient).mockReturnValue(makeSupabase() as never);

    const res = await POST(
      jsonReq({
        client_name: "Test",
        redirect_uris: [uri],
        token_endpoint_auth_method: "none",
      }),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("invalid_redirect_uri");
  });

  it("returns 500 when Supabase insert fails", async () => {
    const { getSupabaseClient } = await import("@/lib/supabase");
    vi.mocked(getSupabaseClient).mockReturnValue(
      makeSupabase({ message: "RLS violation" }) as never,
    );

    const res = await POST(
      jsonReq({
        redirect_uris: ["https://claude.ai/cb"],
        token_endpoint_auth_method: "none",
      }),
    );
    expect(res.status).toBe(500);
  });
});
