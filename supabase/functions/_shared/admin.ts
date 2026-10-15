import { createClient } from "npm:@supabase/supabase-js@2.45.4";

// Service-role client: bypasses row-level security. Only use in edge functions.
export const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

export function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// For functions the web console calls from the browser.
export const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
export function withCors(res: Response) {
  for (const [k, v] of Object.entries(cors)) res.headers.set(k, v);
  return res;
}
