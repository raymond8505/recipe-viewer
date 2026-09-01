# Parallel Checkouts (multi-session dev)

Multiple checkouts of this repo (e.g. `recipe-viewer`, `recipe-viewer__junior`) run dev servers
simultaneously on one machine. Each checkout claims its own ports/hostname via env — three vars,
read only by `package.json` scripts and `.mcp.json`, **never under `src/`** (keep it that way; a
var consumed in `src/` must go through `src/env.ts` + deploy wiring, which these deliberately skip):

- `PORT` (next dev, default 3000), `SB_PORT` (storybook, default 6006), `SB_HOST` (hostname in
  `.mcp.json`'s storybook MCP URL, default `localhost`).
- **Two homes, values must match:** `.env.yarn` (gitignored; copy from `.env.yarn.example`) — Yarn 4
  injects it into every `yarn <script>` run — and `.claude/settings.local.json`'s `"env"` block,
  which is what Claude Code uses to expand `${SB_HOST}`/`${SB_PORT}` in `.mcp.json` (takes effect on
  session restart). A checkout with neither file gets the defaults.
- **`MCP_PUBLIC_URL` in `.env.local` must point at the checkout's own host:port** — it feeds OAuth
  metadata, the JWT issuer, and MCP recipe deep-links; a stale value makes this checkout advertise
  another checkout's server.
- **Give each checkout a distinct hostname** (`localhost`, `127.0.0.1`) in its browse URL and
  `MCP_PUBLIC_URL`: cookies are port-blind, so two localhost dev servers share the `auth_session`
  jar (login/logout state) even on different ports; a distinct host also separates localStorage
  (cook-mode timers). With `PORT` set explicitly, a port collision fails loudly instead of next dev
  silently sliding to a free port while pinned URLs point at the other checkout.
- After a fresh clone: `yarn install`, copy `.env.local` + create `.env.yarn` /
  `.claude/settings.local.json`, and run `npx next typegen` (typecheck needs the generated
  `RouteContext` types).
- **Still shared between checkouts** (accept, don't fight): production Supabase (same rows, storage
  bucket, `oauth_clients`), `OAUTH_JWT_SECRET` + issuer (tokens minted by one checkout validate in
  another), and Gemini/USDA quotas — concurrent edits of the same recipe schedule duplicate
  normalization runs arbitrated only by the fingerprint guard.
