// create-checkout — Stripe Checkout Session
// verify_jwt = true
import Stripe from "npm:stripe@^17";
import { createClient } from "npm:@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
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
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const stripeKey = await getStripeKey();
    if (!stripeKey) return json({ error: "Stripe key not configured" }, 500);
    const stripe = new Stripe(stripeKey);

    const { userId, priceId } = await req.json();
    if (!userId || !priceId) return json({ error: "userId and priceId required" }, 400);

    const { data: plan, error: planError } = await supabase
      .from("plans").select("id, name, monthly_minutes, stripe_price_id")
      .eq("stripe_price_id", priceId).eq("is_active", true).single();
    if (planError || !plan) return json({ error: "Unknown or inactive price" }, 400);

    const { data: profile } = await supabase
      .from("profiles").select("stripe_customer_id, email").eq("id", userId).single();

    let customerId = profile?.stripe_customer_id;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: profile?.email, metadata: { supabase_user_id: userId },
      });
      customerId = customer.id;
      await supabase.from("profiles").update({ stripe_customer_id: customerId }).eq("id", userId);
    }

    const siteUrl = Deno.env.get("SITE_URL") || "https://wurx.vercel.app";
    const session = await stripe.checkout.sessions.create({
      customer: customerId, mode: "subscription", payment_method_types: ["card"],
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${siteUrl}/dashboard?success=true`,
      cancel_url: `${siteUrl}/pricing`,
      metadata: { userId, plan_id: plan.id, monthly_minutes: String(plan.monthly_minutes) },
    });
    return json({ url: session.url }, 200);
  } catch (error) {
    console.error("create-checkout error:", error);
    return json({ error: (error as Error).message }, 400);
  }
});
