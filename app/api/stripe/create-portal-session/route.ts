import { NextResponse } from "next/server";

import { ensureBillingProfile } from "@/lib/ai-usage";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
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
    const profile = await ensureBillingProfile(admin, user);

    if (!profile.stripe_customer_id) {
      return NextResponse.json(
        { error: "支払い管理を開くための課金情報がまだありません。" },
        { status: 400 }
      );
    }

    const session = await getStripe().billingPortal.sessions.create({
      customer: profile.stripe_customer_id,
      return_url: `${getOrigin(request)}/settings`
    });

    return NextResponse.json({ url: session.url });
  } catch (error) {
    console.error("stripe portal session error", summarizeStripeError(error));

    return NextResponse.json(
      { error: "支払い管理画面を開けませんでした。時間をおいてもう一度お試しください。" },
      { status: 500 }
    );
  }
}
