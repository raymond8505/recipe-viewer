import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth", () => ({
  getIsLoggedIn: vi.fn(),
}));
vi.mock("@/lib/webhook", () => ({
  callRecipeWebhook: vi.fn(),
}));

import { POST as wfdPost } from "@/app/api/whats-for-dinner/route";
import { POST as headsupPost } from "@/app/api/headsup/search/route";
import { getIsLoggedIn } from "@/lib/auth";
import { callRecipeWebhook } from "@/lib/webhook";

function jsonReq(body: unknown) {
  return new Request("http://localhost/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("session-gated webhook proxy routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("POST /api/whats-for-dinner", () => {
    it("returns 401 when logged out, without touching the paid webhook", async () => {
      vi.mocked(getIsLoggedIn).mockResolvedValue(false);

      const res = await wfdPost(jsonReq({ prompt: "pasta" }));

      expect(res.status).toBe(401);
      expect(callRecipeWebhook).not.toHaveBeenCalled();
    });

    it("proxies to the webhook and returns recipes when logged in", async () => {
      vi.mocked(getIsLoggedIn).mockResolvedValue(true);
      vi.mocked(callRecipeWebhook).mockResolvedValue({
        ok: true,
        recipes: [{ id: "r1" }],
      } as never);

      const res = await wfdPost(jsonReq({ prompt: "pasta", choices: [] }));

      expect(res.status).toBe(200);
      expect((await res.json()).recipes).toHaveLength(1);
      expect(callRecipeWebhook).toHaveBeenCalledOnce();
    });

    it("returns 400 for a missing prompt when logged in", async () => {
      vi.mocked(getIsLoggedIn).mockResolvedValue(true);

      const res = await wfdPost(jsonReq({}));

      expect(res.status).toBe(400);
      expect(callRecipeWebhook).not.toHaveBeenCalled();
    });
  });

  describe("POST /api/headsup/search", () => {
    it("returns 401 when logged out, without touching the paid webhook", async () => {
      vi.mocked(getIsLoggedIn).mockResolvedValue(false);

      const res = await headsupPost(jsonReq({ prompt: "elephant" }));

      expect(res.status).toBe(401);
      expect(callRecipeWebhook).not.toHaveBeenCalled();
    });

    it("proxies to the webhook and returns recipes when logged in", async () => {
      vi.mocked(getIsLoggedIn).mockResolvedValue(true);
      vi.mocked(callRecipeWebhook).mockResolvedValue({
        ok: true,
        recipes: [{ id: "r1" }, { id: "r2" }],
      } as never);

      const res = await headsupPost(jsonReq({ prompt: "elephant" }));

      expect(res.status).toBe(200);
      expect(callRecipeWebhook).toHaveBeenCalledOnce();
    });
  });
});
