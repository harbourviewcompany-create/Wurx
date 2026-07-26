// provider-payouts — Stripe Connect onboarding & payouts
// verify_jwt = true
import Stripe from "npm:stripe@^17";
import { createClient } from "npm:@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
async function getStripeKey(): Promise<string | null> {
  const { data, error } = await supabase.rpc("get_app_secret", { p_name: "STRIPE_SECRET_KEY" });
  if (error) { console.error("Vault read failed:", error.message); return null; }
  return (data as string) ?? null;
}
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userErr } = await supabase.auth.getUser(token);
    if (userErr || !userData.user) return json({ error: "Not authenticated" }, 401);

    const userId = userData.user.id;
    const { data: provider } = await supabase.from("providers").select("id, stripe_connect_account_id, payout_enabled").eq("user_id", userId).single();
    if (!provider) return json({ error: "Not a provider" }, 400);

    const stripeKey = await getStripeKey();
    if (!stripeKey) return json({ error: "Billing not configured" }, 500);
    const stripe = new Stripe(stripeKey);
    const siteUrl = Deno.env.get("SITE_URL") || "https://wurx.vercel.app";

    if (!provider.stripe_connect_account_id) {
      const account = await stripe.accounts.create({ type: "express", metadata: { provider_id: provider.id } });
      await supabase.from("providers").update({ stripe_connect_account_id: account.id }).eq("id", provider.id);
      const link = await stripe.accountLinks.create({
        account: account.id,
        refresh_url: `${siteUrl}/provider?onboarding=refresh`,
        return_url: `${siteUrl}/provider?onboarding=success`,
        type: "account_onboarding",
      });
      return json({ url: link.url, onboarding: true });
    }

    const account = await stripe.accounts.retrieve(provider.stripe_connect_account_id);
    if (!account.details_submitted || !account.charges_enabled) {
      const link = await stripe.accountLinks.create({
        account: provider.stripe_connect_account_id,
        refresh_url: `${siteUrl}/provider?onboarding=refresh`,
        return_url: `${siteUrl}/provider?onboarding=success`,
        type: "account_onboarding",
      });
      return json({ url: link.url, onboarding: true });
    }

    if (!provider.payout_enabled) {
      await supabase.from("providers").update({ payout_enabled: true }).eq("id", provider.id);
    }

    const { data: earnings } = await supabase.from("provider_earnings").select("id, net_cents, booking_id")
      .eq("provider_id", provider.id).is("payout_id", null);
    const totalCents = (earnings ?? []).reduce((sum, e) => sum + e.net_cents, 0);

    if (totalCents < 100) {
      return json({ error: "Minimum payout is $1.00", totalCents, onboarding: false }, 400);
    }

    const transfer = await stripe.transfers.create({
      amount: totalCents, currency: "cad",
      destination: provider.stripe_connect_account_id,
      metadata: { provider_id: provider.id, earnings_count: String(earnings?.length ?? 0) },
    });

    const { data: payout } = await supabase.from("provider_payouts").insert({
      provider_id: provider.id, amount_cents: totalCents,
      stripe_transfer_id: transfer.id, released_by: userId,
    }).select().single();

    if (payout && earnings?.length) {
      await supabase.from("provider_earnings").update({ payout_id: payout.id }).in("id", earnings.map((e) => e.id));
    }

    return json({ payoutId: payout?.id, amountCents: totalCents, transferId: transfer.id, onboarding: false });
  } catch (error) {
    console.error("provider-payouts error:", error);
    return json({ error: (error as Error).message }, 400);
  }
});
