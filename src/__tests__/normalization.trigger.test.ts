// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { scheduleNormalization } from "@/lib/normalization/trigger";
import { after } from "next/server";
import { runNormalization } from "@/lib/normalization/graph";

const mockAfter = vi.hoisted(() => vi.fn());
const mockRunNormalization = vi.hoisted(() => vi.fn());

vi.mock("next/server", () => ({ after: mockAfter }));
// vi.mock intercepts the trigger's DYNAMIC import of the graph module too.
vi.mock("@/lib/normalization/graph", () => ({
  runNormalization: mockRunNormalization,
}));

beforeEach(() => {
  vi.clearAllMocks();
  mockRunNormalization.mockResolvedValue(undefined);
});

describe("scheduleNormalization", () => {
  it("defers the run via after() inside a request scope", async () => {
    scheduleNormalization("r-1");

    expect(after).toHaveBeenCalledTimes(1);
    expect(runNormalization).not.toHaveBeenCalled();

    // Simulate Next flushing the after() queue post-response.
    const deferred = mockAfter.mock.calls[0][0] as () => Promise<void>;
    await deferred();

    expect(runNormalization).toHaveBeenCalledWith("r-1");
  });

  it("runs detached when after() throws (vitest / scripts — no request scope)", async () => {
    mockAfter.mockImplementation(() => {
      throw new Error("after() called outside a request scope");
    });

    expect(() => scheduleNormalization("r-1")).not.toThrow();

    await vi.waitFor(() => {
      expect(runNormalization).toHaveBeenCalledWith("r-1");
    });
  });

  it("never throws even when the detached run rejects", async () => {
    mockAfter.mockImplementation(() => {
      throw new Error("no request scope");
    });
    mockRunNormalization.mockRejectedValue(new Error("graph exploded"));
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    expect(() => scheduleNormalization("r-1")).not.toThrow();

    await vi.waitFor(() => {
      expect(consoleError).toHaveBeenCalledWith(
        "Detached normalization run failed for r-1:",
        expect.any(Error),
      );
    });
    consoleError.mockRestore();
  });
});
