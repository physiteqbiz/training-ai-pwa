import { NextResponse } from "next/server";

import { BILLING_PROFILE_SELECT, ensureBillingProfile } from "@/lib/ai-usage";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireEnv } from "@/lib/env";
import { getStripe, summarizeStripeError } from "@/lib/stripe";

export const runtime = "nodejs";

function getOrigin(request: Request) {
  return request.headers.get("origin") ?? new URL(request.url).origin;
}

export async function POST(request: Request) {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user }
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "ログインが必要です。" }, { status: 401 });
    }

    const admin = createSupabaseAdminClient();
    const stripe = getStripe();
    let profile = await ensureBillingProfile(admin, user);
    let stripeCustomerId = profile.stripe_customer_id;

    if (!stripeCustomerId) {
      const customer = await stripe.customers.create({
        email: user.email ?? undefined,
        metadata: {
          supabase_user_id: user.id
        }
      });

      stripeCustomerId = customer.id;

      const { data, error } = await admin
        .from("profiles")
        .update({ stripe_customer_id: stripeCustomerId })
        .eq("id", user.id)
        .select(BILLING_PROFILE_SELECT)
        .single();

      if (error || !data) {
        throw error ?? new Error("Failed to save Stripe customer.");
      }

      profile = data;
    }

    const origin = getOrigin(request);
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: stripeCustomerId,
      client_reference_id: user.id,
      line_items: [
        {
          price: requireEnv("STRIPE_PRICE_ID_PRO_MONTHLY"),
          quantity: 1
        }
      ],
      metadata: {
        supabase_user_id: user.id
      },
      subscription_data: {
        metadata: {
          supabase_user_id: user.id
        }
      },
      success_url: `${origin}/settings?checkout=success`,
      cancel_url: `${origin}/pricing?checkout=cancel`
    });

    if (!session.url) {
      throw new Error("Stripe Checkout Session URL was empty.");
    }

    return NextResponse.json({ url: session.url, customerId: profile.stripe_customer_id });
  } catch (error) {
    console.error("stripe checkout session error", summarizeStripeError(error));

    return NextResponse.json(
      { error: "決済画面の作成に失敗しました。時間をおいてもう一度お試しください。" },
      { status: 500 }
    );
  }
}
