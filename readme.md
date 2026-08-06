# Recipe Viewer

- A recipe viewing tool built for use in the kitchen during cooking.
- A barebones recipe CMS with MCP tools and agent skill for authoring recipes

## Watch the demo

[![Watch the video](https://raw.githubusercontent.com/raymond8505/recipe-viewer/main/video.png)](https://www.youtube.com/watch?v=qOG80UKUkFI)

## Try the app
[try the latest build with my recipes](https://new.raymonds.recipes)
---

## Why this exists

Thinking of food combinations is fun. Cooking new recipes is fun. Writing recipes is not fun. 

I think an agent can handle that well, and being able to use my own agent is better than having to use some bolted on in-app agent.

A purpose built recipe viewer for use on a touch device in the kitchen while cooking solves a lot of problems for me.

### Labelled timers
Companion skill instructs your agent how to extract timed steps and create labelled timers from instructions

### Well structured instructions and ingredients for reference during prep
Instructions and ingredients grouped and sorted for the way I want to cook

### Easy to use scaling, converting
Scale the recipe by portions, convert between units, split the final meal for target nutrition per portion, pin a single ingredient amount and scale the recipe around it

### Reliable nutrition information without tedious data entry
I want to know my macros for my home cooking, I don't want to have to fill out a spreadsheet for every recipe or manage an exhaustive database of known ingredients

### Effortless recipe iteration
Take notes during the cook and during first taste, tell your agent to address them in the recipe- re-formulate ingredients, re-write instructions, update nutrition, or any other boring thing that isn't cooking food or eating food.

## Features

### Cooking Mode
Built for use on a tablet while you cook.

#### Touch-first, full-screen
Every control is a big tap target, deliberately larger fonts and spacing for easy reference at a glance while you cook.

#### Timers generated from instructions.
When an instruction says "simmer for 15 minutes," that becomes a labelled timer you can start with a tap. Add your own custom timers too. They alarm when they're done, survive a page reload, and sort themselves sensibly (alarms first, then running, then paused).
The screen stays awake while you cook

### Meal Mode
Cooking a whole dinner, not just one dish? Pull several recipes into a single cooking session. Each recipe keeps its own step progress, and all their timers land in one shared place so you're not juggling apps to get everything to the table at once.

### Scaling
- Scale a recipe by servings and every ingredient amount follows.
- Amounts display in sensible units as they scale (you get "1 tbsp," not "15 ml").
- Scaling optionally rounds for imperial (.2 tsp = "~1/4 tsp")
- Anchor an ingredient "I've only got 300 g of flour" — pin that, and the whole recipe rescales to match what you actually have.

### Shopping list
Tap ingredients to build a shopping list, then copy it to your clipboard as plain text to paste in your notes app of choice. 

### Recipe management
- **A full editor** with drag-to-reorder ingredient groups and instruction sections.
- **Images** — upload your own, or generate one from the recipe.
- **Cooking notes** — your own annotations on a recipe, saved as you type.

### Nutrition
A per-serving nutrition panel that's aware of your current portion size, shown when the recipe has the data and quietly absent when it doesn't.

### MCP + Skill
Ships with an MCP server and skill so you can search and manage your recipes conversationally.

The skill contains instructions for the agent on how to ideate, research and author recipes with reliable consistency.* As well as upload images to recipes- attachments in the conversation or URLs.

*GIGO rules still apply.

---

## Engineering Notes

### Front-end architecture

**Next.js 16 (App Router) + React + TypeScript.** Server Components by default, `output: "standalone"` for a lean container.

**Styling with single sources of truth.** Tailwind 4 + shadcn/ui (the `radix-nova` style). Every style decision has exactly one home:
- Colours live as CSS tokens in `globals.css` (`:root` plus an `@theme inline` block). Components use semantic utilities (`bg-card`, `text-muted-foreground`, `text-brand`) — never raw palette values. A new brand colour is a new token, not a hex sprinkled across ten files.
- The app's font and page surface are declared **once**, in `AppChrome.tsx`, which is consumed by *both* the real app and Storybook. They can't drift apart, because they read the same module.
- Badges, pills, and icons are named components wrapping the shadcn primitive, never inline-styled `<span>`s. Overrides go through `className` and `twMerge` last-wins, not by editing the generated primitive.

**Component-driven, with Storybook 10 as living documentation.** Every UI component has stories covering its real states. Fixtures are shared between Storybook and the test suite (`src/fixtures/`), so the exact same data both renders the docs and drives the assertions.

### Agent-native design (MCP)

The premise: an AI assistant should be able to use this app the way a person can — search recipes, read one, edit it, upload an image — as a properly authenticated client.

- An **MCP server** (`src/lib/mcp/`) exposes those capabilities as tools.
- Auth is a real **OAuth 2.1 flow with PKCE** (`jose` for JWT signing)
- For narrow, dangerous operations like an agent uploading an image, there are **short-lived, single-recipe capability tokens** — scoped to one recipe UUID, 5 minute TTL — so an agent never holds more authority than the task in front of it needs.

### Security

- `src/lib/api/routePolicy.ts` is the **single source of truth** for every route's exposure level, each with a written rationale (`session`, `session-or-recipe-token`, `public-read`, the OAuth endpoints, etc.).
- `src/__tests__/route-auth-policy.test.ts` is a **build-breaking gate**. It fails if any route file has no registry entry (or vice versa)
- OAuth2 and short lived tokens for MCP. Authorize the MCP server with your agent via regular OAuth flow. When the agent needs to make a change with a tool it mints a short lived token scoped to the target recipe. The token expires in 5 minutes or once used. Whichever comes first. Tightly scoped token auth for tool usage, without exposing the original OAuth token to the agent.

### CI/CD & per-PR staging

- **Multi-stage Docker build**, self-hosted on a VPS behind Traefik.
- **Automatic staging env** Every open PR gets its own live container, PR containers are identical to prod just with a different sub domain. When build succeeds, a link is pinned to the PR. PR containers are torn down when they get merged to main.

---

## Tech stack

| Layer | Choice | Notes |
| --- | --- | --- |
| Framework | **Next.js 16** (App Router) | Server Components by default, `standalone` output |
| Language | **TypeScript 5** | strict |
| UI runtime | **React 18** | |
| Styling | **Tailwind CSS 4** | token system in `globals.css`, `tailwind-merge` |
| Components | **shadcn/ui** (`radix-nova`) on Radix UI | named wrapper components, no inline styles |
| Icons | **lucide-react** | one named component per icon |
| Drag & drop | **@dnd-kit** | editor reordering |
| Data | **Supabase** (Postgres) | repo layer in `src/lib/recipes.ts`, Schema.org/Recipe |
| Search | **pgvector** + **Gemini embeddings** (768-dim) | cosine distance, embeddings as derived columns |
| Auth / agents | **OAuth 2.1 + PKCE**, JWT (`jose`), MCP server | scoped recipe capability tokens |
| Validation | **Zod 4** + **@t3-oss/env-nextjs** | runtime + startup env validation |
| Testing | **Vitest** + **Testing Library** | role/label queries, build-breaking auth gate |
| Component docs | **Storybook 10** (`@storybook/nextjs-vite`) | fixtures shared with tests |
| Runtime | **Node 24** | |
| Deploy | **Docker** (multi-stage) + **Traefik** on a VPS | per-PR staging, GitHub Actions |
