import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
  server: {
    AUTH_PASSWORD: z.string().min(1),
    RESCRAPE_WEBHOOK_URL: z.string().url(),
    EDIT_WEBHOOK_URL: z.string().url(),
    MCP_API_TOKEN: z.string().min(1),
    REGEN_IMAGE_WEBHOOK_URL: z.string().url(),
    WHATS_FOR_DINNER_WEBHOOK_URL: z.string().url(),
    HEADSUP_SEARCH_WEBHOOK_URL: z.string().url(),
  },
  client: {
    NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY: z.string().min(1),
  },
  runtimeEnv: {
    AUTH_PASSWORD: process.env.AUTH_PASSWORD,
    RESCRAPE_WEBHOOK_URL: process.env.RESCRAPE_WEBHOOK_URL,
    EDIT_WEBHOOK_URL: process.env.EDIT_WEBHOOK_URL,
    MCP_API_TOKEN: process.env.MCP_API_TOKEN,
    REGEN_IMAGE_WEBHOOK_URL: process.env.REGEN_IMAGE_WEBHOOK_URL,
    WHATS_FOR_DINNER_WEBHOOK_URL: process.env.WHATS_FOR_DINNER_WEBHOOK_URL,
    HEADSUP_SEARCH_WEBHOOK_URL: process.env.HEADSUP_SEARCH_WEBHOOK_URL,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY:
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY,
  },
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
  emptyStringAsUndefined: true,
});
