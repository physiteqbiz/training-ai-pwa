import { NextResponse } from "next/server";
import type Stripe from "stripe";

import { FREE_AI_QUOTA_MONTHLY, PRO_AI_QUOTA_MONTHLY } from "@/lib/billing";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireEnv } from "@/lib/env";
import { getStripe, summarizeStripeError } from "@/lib/stripe";

export const runtime = "nodejs";

function getId(value: string | { id: string } | null | undefined) {
  if (!value) {
    return null;
  }

  return typeof value === "string" ? value : value.id;
}

function getSubscriptionCurrentPeriodEnd(subscription: Stripe.Subscription) {
  const legacySubscription = subscription as Stripe.Subscription & {
    current_period_end?: number | null;
  };
  const unixSeconds =
    subscription.items?.data?.[0]?.current_period_end ??
    legacySubscription.current_period_end ??
    subscription.trial_end ??
    null;

  return unixSeconds ? new Date(unixSeconds * 1000).toISOString() : null;
}

async function updateProfileFromSubscription(subscription: Stripe.Subscription) {
  const customerId = getId(subscription.customer);

  if (!customerId) {
    return;
  }

  const isPro = subscription.status === "active" || subscription.status === "trialing";
  const admin = createSupabaseAdminClient();
  const { error } = await admin
    .from("profiles")
    .update({
      plan: isPro ? "pro" : "free",
      subscription_status: subscription.status,
      stripe_subscription_id: subscription.id,
      current_period_end: getSubscriptionCurrentPeriodEnd(subscription),
      ai_quota_monthly: isPro ? PRO_AI_QUOTA_MONTHLY : FREE_AI_QUOTA_MONTHLY
    })
    .eq("stripe_customer_id", customerId);

  if (error) {
    throw error;
  }
}

async function updateProfileForPaymentFailure(invoice: Stripe.Invoice) {
  const subscriptionId = getId(invoice.parent?.subscription_details?.subscription);

  if (subscriptionId) {
    const subscription = await getStripe().subscriptions.retrieve(subscriptionId);
    await updateProfileFromSubscription(subscription);
    return;
  }

  const customerId = getId(invoice.customer);

  if (!customerId) {
    return;
  }

  const admin = createSupabaseAdminClient();
  const { error } = await admin
    .from("profiles")
    .update({
      plan: "free",
      subscription_status: "past_due",
      ai_quota_monthly: FREE_AI_QUOTA_MONTHLY
    })
    .eq("stripe_customer_id", customerId);

  if (error) {
    throw error;
  }
}

async function handleCheckoutSessionCompleted(session: Stripe.Checkout.Session) {
  const customerId = getId(session.customer);
  const subscriptionId = getId(session.subscription);

  if (!customerId) {
    return;
  }

  const admin = createSupabaseAdminClient();
  await admin
    .from("profiles")
    .update({ stripe_customer_id: customerId })
    .eq("id", session.client_reference_id ?? session.metadata?.supabase_user_id ?? "");

  if (subscriptionId) {
    const subscription = await getStripe().subscriptions.retrieve(subscriptionId);
    await updateProfileFromSubscription(subscription);
  }
}

export async function POST(request: Request) {
  const stripe = getStripe();
  const signature = request.headers.get("stripe-signature");

  if (!signature) {
    return NextResponse.json({ error: "Missing Stripe signature." }, { status: 400 });
  }

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(
      await request.text(),
      signature,
      requireEnv("STRIPE_WEBHOOK_SECRET")
    );
  } catch {
    return NextResponse.json({ error: "Invalid Stripe signature." }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed":
        await handleCheckoutSessionCompleted(event.data.object as Stripe.Checkout.Session);
        break;
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted":
        await updateProfileFromSubscription(event.data.object as Stripe.Subscription);
        break;
      case "invoice.payment_failed":
        await updateProfileForPaymentFailure(event.data.object as Stripe.Invoice);
        break;
      default:
        break;
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("stripe webhook handler error", {
      type: event.type,
      message: summarizeStripeError(error)
    });

    return NextResponse.json({ error: "Webhook handling failed." }, { status: 500 });
  }
}
