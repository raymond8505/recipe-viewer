-- 0015_recipes_custom_source
--
-- Recipes authored in this app carried the site's own hostname in `source`
-- ('raymonds.recipes', 'new.raymonds.recipes'). Re-point them at the literal
-- 'custom'. Applied via the Supabase MCP `apply_migration` tool (checked-in
-- record only; see 0002).
--
-- Why: "is this the user's own recipe?" — the question the Re-scrape control
-- asks, since a self-authored recipe has no upstream page to re-fetch — was
-- answered from deploy config. The UI compared the stored `url` against
-- window.location.href, and the data leaned on the host being in `source`.
-- Both are wrong in the same two ways:
--
-- 1. Staging hosts. ~50 of these rows were created on a per-PR container, so
--    their url is e.g. https://feature-ingredient-mcp-crud.new.raymonds.recipes
--    /recipes/<id>. That never equals the prod href, so those recipes wrongly
--    offered Re-scrape.
-- 2. A rename of the site host would silently break both halves at once.
--
-- 'custom' is host-independent and is now what the app writes: create_recipe
-- defaults source to it when `url` is omitted (i.e. the recipe lives on this
-- instance), and isOwnRecipe() in src/lib/format.ts is the single reader.
--
-- Both hostnames are the SAME deployment (new.raymonds.recipes is the live
-- site; raymonds.recipes is the older label for it), so they collapse to one
-- value without losing a distinction anyone can act on. Scraped rows
-- (instagram.com, seriouseats.com, …) are untouched.
--
-- Consequence, accepted: the ?source= browse filter and MCP search_recipes'
-- `source` filter now key on 'custom' for these rows.

update public.recipes
set source = 'custom'
where source in ('raymonds.recipes', 'new.raymonds.recipes');
