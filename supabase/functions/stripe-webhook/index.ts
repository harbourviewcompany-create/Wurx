// stripe-webhook — Stripe event handler
// verify_jwt = false
import Stripe from "npm:stripe@^17";
import { createClient } from "npm:@supabase/supabase-js@2";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") ?? "sk_webhook_only");
const cryptoProvider = Stripe.createSubtleCryptoProvider();
const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

async function getSigningSecret(): Promise<string | null> {
  const { data, error } = await supabase.rpc("get_app_secret", { p_name: "STRIPE_WEBHOOK_SIGNING_SECRET" });
  if (error) { console.error("Vault read failed:", error.message); return null; }
  return (data as string) ?? null;
}

function periodDates(sub: Stripe.Subscription) {
  const item = sub.items?.data?.[0] as any;
  const start = (sub as any).current_period_start ?? item?.current_period_start;
  const end = (sub as any).current_period_end ?? item?.current_period_end;
  return {
    current_period_start: start ? new Date(start * 1000).toISOString() : null,
    current_period_end: end ? new Date(end * 1000).toISOString() : null,
  };
}

Deno.serve(async (req: Request) => {
  const signature = req.headers.get("Stripe-Signature");
  const body = await req.text();
  if (!signature) return new Response("Missing Stripe-Signature", { status: 400 });

  const signingSecret = await getSigningSecret();
  if (!signingSecret) return new Response("Webhook secret not configured", { status: 500 });

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(body, signature, signingSecret, undefined, cryptoProvider);
  } catch (err) {
    console.error("Webhook verification failed:", (err as Error).message);
    return new Response(`Webhook Error: ${(err as Error).message}`, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const userId = session.metadata?.userId;
        const planId = session.metadata?.plan_id ?? null;
        const stripeSubId = session.subscription as string | null;
        if (userId && stripeSubId) {
          let stripePriceId: string | null = null;
          if (planId) {
            const { data: plan } = await supabase.from("plans").select("stripe_price_id").eq("id", planId).single();
            stripePriceId = plan?.stripe_price_id ?? null;
          }
          await supabase.from("subscriptions").upsert(
            { user_id: userId, plan_id: planId, stripe_subscription_id: stripeSubId, stripe_price_id: stripePriceId, status: "active" },
            { onConflict: "stripe_subscription_id" }
          );
        }
        break;
      }
      case "invoice.paid": {
        const invoice = event.data.object as Stripe.Invoice;
        const stripeSubId = (invoice as any).subscription as string | null;
        if (!stripeSubId) break;
        const { data: subRow } = await supabase.from("subscriptions").select("id, user_id, plan_id").eq("stripe_subscription_id", stripeSubId).single();
        if (!subRow) break;
        const line = (invoice as any).lines?.data?.[0];
        if (line?.period) {
          await supabase.from("subscriptions").update({
            status: "active",
            current_period_start: line.period.start ? new Date(line.period.start * 1000).toISOString() : null,
            current_period_end: line.period.end ? new Date(line.period.end * 1000).toISOString() : null,
          }).eq("id", subRow.id);
        }
        let monthlyMinutes: number | null = null;
        if (subRow.plan_id) {
          const { data: plan } = await supabase.from("plans").select("monthly_minutes").eq("id", subRow.plan_id).single();
          monthlyMinutes = plan?.monthly_minutes ?? null;
        }
        if (monthlyMinutes) {
          await supabase.from("hour_ledger").insert({
            user_id: subRow.user_id, delta_minutes: monthlyMinutes,
            entry_type: "grant", description: "Subscription period credit",
            subscription_id: subRow.id, stripe_event_id: event.id,
          });
        }
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        await supabase.from("subscriptions").update({
          status: sub.status, cancel_at_period_end: sub.cancel_at_period_end, ...periodDates(sub),
        }).eq("stripe_subscription_id", sub.id);
        break;
      }
    }
  } catch (err) {
    console.error(`Error handling ${event.type}:`, err);
  }
  return new Response(JSON.stringify({ received: true }), { status: 200, headers: { "Content-Type": "application/json" } });
});
