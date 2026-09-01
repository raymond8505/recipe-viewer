// The MCP tool name registry.
//
// Tool descriptions cite each other constantly ("call search_ingredients
// first", "use clear_cooking_notes to clear it") — those citations are
// instructions an agent will act on, so a stale one is a live bug with no
// compile error behind it. Writing `${TOOL.search_ingredients}` instead of
// typing the name makes a rename fail the build at every citation.
//
// This does NOT make a rename automatic — you still edit each site. It makes
// it impossible to MISS one.
//
// Its own module rather than `keyof typeof TOOL_SCHEMAS`, because schemas.ts
// cites tool names inside the TOOL_SCHEMAS literal itself; deriving the
// registry there would read the binding during its own initialization.
// TOOL_SCHEMAS is tied back to this list with `satisfies Record<ToolName, …>`.

// Order is the tools/list wire order.
export const TOOL_NAMES = [
  "search_recipes",
  "search_ingredients",
  "get_ingredient",
  "create_ingredient",
  "update_ingredient",
  "delete_ingredient",
  "get_recipe",
  "get_token",
  "create_recipe",
  "update_recipe",
  "clear_cooking_notes",
  "delete_recipe",
  "upload_recipe_image",
] as const;

export type ToolName = (typeof TOOL_NAMES)[number];

/** Identity map for citing a tool by name inside another tool's description. */
export const TOOL = Object.fromEntries(
  TOOL_NAMES.map((name): [ToolName, ToolName] => [name, name]),
) as { [K in ToolName]: K };
