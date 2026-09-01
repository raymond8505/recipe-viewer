"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import ConfirmBar from "@/components/ConfirmBar";
import { normalizeRecipe } from "@/lib/api/recipes";
import { cn } from "@/lib/utils";

interface NormalizeActionProps {
  recipeId: string;
}

/**
 * The breakdown page's Normalize control — the single owner of which of its
 * three faces is showing: the confirm, the post-queue refresh affordance, or
 * the button itself.
 *
 * It is a component rather than three ternaries inline because the states are
 * mutually exclusive and interlocking: `confirming` is view state, while
 * `state` tracks the request, and the queued face must NOT inherit the confirm
 * (it is a local refresh and costs nothing). Keeping that decision in one named
 * place is what stops a later edit wiring the confirm to the wrong branch.
 *
 * The confirm exists because normalization queues a LangGraph run — model
 * parsing plus a USDA lookup per line — and the route returns before any of it
 * happens, so unlike re-scrape and regen-image there is nothing to undo.
 */
export default function NormalizeAction({ recipeId }: NormalizeActionProps) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "queueing" | "queued">("idle");
  const [confirming, setConfirming] = useState(false);

  async function handleRenormalize() {
    setConfirming(false);
    setState("queueing");
    try {
      await normalizeRecipe(recipeId);
      setState("queued");
    } catch {
      setState("idle");
    }
  }

  return (
    <div
      className={cn(
        "ml-auto w-full",
        // The bar needs room for its question; the bare button must keep its
        // natural size, so the width is only applied while confirming.
        confirming ? "sm:w-96" : "sm:w-auto",
      )}
    >
      {confirming ? (
        <ConfirmBar
          message="Re-run ingredient normalization? This re-parses every ingredient line."
          confirmLabel="Normalize"
          onCancel={() => setConfirming(false)}
          onConfirm={handleRenormalize}
        />
      ) : state === "queued" ? (
        // A 200 from the normalize route means "queued", not "done" — the run
        // happens post-response, so refreshing is the way to see it. No confirm
        // on this one: it's a local refresh and costs nothing.
        <Button
          size="sm"
          variant="secondary"
          className="w-full sm:w-auto"
          onClick={() => router.refresh()}
        >
          Queued — check again
        </Button>
      ) : (
        <Button
          size="sm"
          variant="secondary"
          className="w-full sm:w-auto"
          disabled={state === "queueing"}
          onClick={() => setConfirming(true)}
          title="Re-parses and re-matches every line; manual matches are preserved"
        >
          Normalize
        </Button>
      )}
    </div>
  );
}
