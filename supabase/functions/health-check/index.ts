// health-check — Platform health monitoring
// verify_jwt = false
import { createClient } from "npm:@supabase/supabase-js@2";
const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);
Deno.serve(async () => {
  const checks = { database: false, auth: false, timestamp: new Date().toISOString() };
  try {
    const { error: dbError } = await supabase.from("app_settings").select("key").limit(1);
    checks.database = !dbError;
  } catch { checks.database = false; }
  try {
    const { error: authError } = await supabase.auth.getSession();
    checks.auth = !authError;
  } catch { checks.auth = false; }
  const healthy = checks.database && checks.auth;
  return new Response(JSON.stringify(checks), {
    status: healthy ? 200 : 503,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
});
