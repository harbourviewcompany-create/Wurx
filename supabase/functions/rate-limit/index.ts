// rate-limit — Distributed rate limiting
// verify_jwt = false
import { createClient } from "npm:@supabase/supabase-js@2";
const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);
Deno.serve(async (req: Request) => {
  const { key, windowSeconds = 60, maxRequests = 30 } = await req.json();
  if (!key) return new Response("Missing key", { status: 400 });
  const windowStart = new Date(Date.now() - windowSeconds * 1000).toISOString();
  const { data, error } = await supabase.rpc("check_rate_limit", {
    p_key: key, p_window_start: windowStart, p_max_requests: maxRequests,
  });
  if (error) {
    console.error("Rate limit error:", error);
    return new Response(JSON.stringify({ allowed: true }), { status: 200, headers: { "Content-Type": "application/json" } });
  }
  return new Response(JSON.stringify({ allowed: data }), { status: 200, headers: { "Content-Type": "application/json" } });
});
