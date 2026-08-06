-- 0011_ingredients_fdc_identity
--
-- One USDA food, one catalog row. Applied via the Supabase MCP
-- `apply_migration` tool (checked-in record only; see 0002).
--
-- Catalog rows used to be named in recipe language ("cilantro") with USDA's
-- description as an alias, which made the SAME food reachable under as many
-- names as recipes had for it: fdc 169997 existed three times ("cilantro",
-- "coriander", "reserved cilantro and mint") and fdc 170000 twice. The naming
-- is inverted as of the accompanying code change — the description is now
-- canonical and recipe language lives in `aliases` — and this index makes the
-- duplication structurally impossible rather than merely unlikely.
--
-- Partial on purpose: hand-entered rows carry no fdc_id and stay unconstrained,
-- however many of them there are. Rows that DO carry one are bound whatever
-- their `source`, so a manual row for a USDA food is reused by a later import
-- rather than having a rival minted beside it.
--
-- ORDERING: this must be applied AFTER the catalog is emptied. Creating it
-- against the pre-existing data fails on the two duplicate fdc_id groups above.

create unique index ingredients_fdc_id_key
  on public.ingredients (fdc_id)
  where fdc_id is not null;
