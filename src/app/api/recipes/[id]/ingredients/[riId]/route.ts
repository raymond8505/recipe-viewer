import { NextResponse } from "next/server";
import { requireSessionOrDev } from "@/lib/api/guard";
import {
  addAliasesAndReembed,
  removeAliasAndReembed,
} from "@/lib/ingredientAliases";
import {
  IngredientRepoError,
  getRecipeIngredientById,
  updateRecipeIngredientAssociation,
} from "@/lib/ingredients";
import { recipeIngredientPatchSchema } from "@/lib/schemas/ingredient";

// Manually re-point one parsed ingredient line at a catalog ingredient (or
// clear it with null). The repo update is scoped on riId AND the recipe id,
// so a valid session can't move another recipe's row through this URL.
//
// This route is also the only place aliases are PRUNED. A user moving a line
// off an ingredient is saying "this wording does not mean that food", so the
// line's name_text is stripped from the old ingredient unconditionally — no
// reference counting. Automated re-matching deliberately never prunes: the
// matcher scoring differently on one run is not a claim about what the user
// calls something.
export const PATCH = requireSessionOrDev(
  async (
    req: Request,
    { params }: RouteContext<"/api/recipes/[id]/ingredients/[riId]">,
  ) => {
    const { id, riId } = await params;

    const body = await req.json().catch(() => null);
    const parsed = recipeIngredientPatchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid patch" }, { status: 400 });
    }

    // Read before writing: the previous association and the line's parsed name
    // drive the alias bookkeeping below, and the update overwrites the former.
    const before = await getRecipeIngredientById(id, riId);
    if (!before) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    try {
      const row = await updateRecipeIngredientAssociation(
        id,
        riId,
        parsed.data.ingredient_id,
      );

      // Both calls are best-effort by contract — the association is already
      // committed and must not be rolled back by alias upkeep. The !== guards
      // keep a no-op re-point (A -> A) from burning a strip-then-add, which
      // would spend two embeddings and briefly leave A without the alias.
      if (before.ingredient_id && before.ingredient_id !== row.ingredient_id) {
        await removeAliasAndReembed(before.ingredient_id, before.name_text);
      }
      if (row.ingredient_id && row.ingredient_id !== before.ingredient_id) {
        await addAliasesAndReembed(row.ingredient_id, [row.name_text]);
      }

      return NextResponse.json(row);
    } catch (err) {
      if (err instanceof IngredientRepoError) {
        return err.kind === "not_found"
          ? NextResponse.json({ error: "Not found" }, { status: 404 })
          : NextResponse.json({ error: "Failed to update association" }, { status: 500 });
      }
      throw err;
    }
  },
);
