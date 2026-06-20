import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";
import { DEFAULT_MAX_IMAGE_BYTES } from "@/lib/imageTypes";

export const env = createEnv({
  server: {
    AUTH_PASSWORD: z.string().min(1),
    RESCRAPE_WEBHOOK_URL: z.string().url(),
    MCP_API_TOKEN: z.string().min(1),
    GEMINI_API_KEY: z.string().min(1),
    REGEN_IMAGE_WEBHOOK_URL: z.string().url(),
    WHATS_FOR_DINNER_WEBHOOK_URL: z.string().url(),
    HEADSUP_SEARCH_WEBHOOK_URL: z.string().url(),
    OAUTH_JWT_SECRET: z.string().min(32),
    MCP_PUBLIC_URL: z.string().url(),
    SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
    MAX_IMAGE_BYTES: z.coerce
      .number()
      .int()
      .positive()
      .default(DEFAULT_MAX_IMAGE_BYTES),
  },
  client: {
    NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY: z.string().min(1),
  },
  runtimeEnv: {
    AUTH_PASSWORD: process.env.AUTH_PASSWORD,
    RESCRAPE_WEBHOOK_URL: process.env.RESCRAPE_WEBHOOK_URL,
    MCP_API_TOKEN: process.env.MCP_API_TOKEN,
    GEMINI_API_KEY: process.env.GEMINI_API_KEY,
    REGEN_IMAGE_WEBHOOK_URL: process.env.REGEN_IMAGE_WEBHOOK_URL,
    WHATS_FOR_DINNER_WEBHOOK_URL: process.env.WHATS_FOR_DINNER_WEBHOOK_URL,
    HEADSUP_SEARCH_WEBHOOK_URL: process.env.HEADSUP_SEARCH_WEBHOOK_URL,
    OAUTH_JWT_SECRET: process.env.OAUTH_JWT_SECRET,
    MCP_PUBLIC_URL: process.env.MCP_PUBLIC_URL,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    MAX_IMAGE_BYTES: process.env.MAX_IMAGE_BYTES,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY:
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY,
  },
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
  emptyStringAsUndefined: true,
});
