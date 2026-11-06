import "server-only";
import { createClient } from "@supabase/supabase-js";
import { createUserHandlers } from "../../../../lib/server/user-service";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const handlers = createUserHandlers(createClient, () => ({
  url: process.env.NEXT_PUBLIC_SUPABASE_URL,
  publicKey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  adminKey: process.env.TECHVENDAS_SUPABASE_ADMIN_KEY,
}));
export const { GET, POST, PATCH, DELETE } = handlers;
