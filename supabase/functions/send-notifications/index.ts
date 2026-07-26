// send-notifications — Drains email queue via Resend
// verify_jwt = false
import { createClient } from "npm:@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}
async function secret(name: string): Promise<string | null> {
  const { data, error } = await supabase.rpc("get_app_secret", { p_name: name });
  if (error) return null;
  return (data as string) ?? null;
}
const BATCH = 50;

Deno.serve(async (req: Request) => {
  const expected = await secret("NOTIFY_DISPATCH_SECRET");
  if (expected) {
    const provided = req.headers.get("X-Dispatch-Secret");
    if (provided !== expected) return json({ error: "Forbidden" }, 403);
  }

  const apiKey = await secret("RESEND_API_KEY");
  const from = (await secret("NOTIFY_FROM_EMAIL")) ?? "Wurx <hello@wurx.ca>";

  const { data: pending, error } = await supabase
    .from("notifications").select("id, user_id, kind, title, body")
    .eq("email_pending", true).order("created_at", { ascending: true }).limit(BATCH);

  if (error) return json({ error: error.message }, 500);
  if (!pending?.length) return json({ sent: 0, skipped: 0 });

  if (!apiKey) {
    await supabase.from("notifications").update({ email_pending: false }).in("id", pending.map((n) => n.id));
    return json({ sent: 0, skipped: pending.length, reason: "RESEND_API_KEY not set" });
  }

  const userIds = [...new Set(pending.map((n) => n.user_id))];
  const { data: profiles } = await supabase.from("profiles").select("id, email, full_name").in("id", userIds);
  const emailOf = new Map((profiles ?? []).map((p) => [p.id, p.email]));

  let sent = 0, skipped = 0;
  for (const n of pending) {
    const to = emailOf.get(n.user_id);
    if (!to) { skipped++; await supabase.from("notifications").update({ email_pending: false }).eq("id", n.id); continue; }
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from, to, subject: n.title,
          text: `${n.title}\n\n${n.body ?? ""}\n\nManage your bookings: https://wurx.vercel.app/dashboard`,
        }),
      });
      if (!res.ok) { console.error("Resend failed", n.id, res.status, await res.text()); continue; }
      await supabase.from("notifications").update({ email_pending: false, emailed_at: new Date().toISOString() }).eq("id", n.id);
      sent++;
    } catch (err) { console.error("Send error", n.id, err); }
  }
  return json({ sent, skipped });
});
