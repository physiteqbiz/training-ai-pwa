import type { User } from "@supabase/supabase-js";

import {
  type AiQuotaUsage,
  type BillingProfile,
  FREE_AI_QUOTA_MONTHLY,
  getAiQuotaMonthlyForPlan,
  getCurrentAiQuotaPeriod,
  getEffectivePlan,
  normalizeAiQuota
} from "@/lib/billing";

export const BILLING_PROFILE_SELECT =
  "id, email, stripe_customer_id, plan, subscription_status, stripe_subscription_id, current_period_end, ai_quota_monthly, ai_quota_used, ai_quota_period";

type SupabaseAdminClient = ReturnType<
  typeof import("@/lib/supabase/admin").createSupabaseAdminClient
>;

export type BillingProfileRow = BillingProfile & {
  id: string;
  email: string | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  current_period_end: string | null;
};

type RecordAiUsageRow = {
  plan: "free" | "pro";
  ai_quota_used: number;
  ai_quota_monthly: number;
  ai_quota_period: string;
};

function toAiQuotaUsage(row: RecordAiUsageRow): AiQuotaUsage {
  const aiQuotaUsed = Number(row.ai_quota_used ?? 0);
  const aiQuotaMonthly = Number(row.ai_quota_monthly ?? FREE_AI_QUOTA_MONTHLY);

  return {
    plan: row.plan,
    planLabel: row.plan === "pro" ? "Pro" : "Free",
    aiQuotaUsed,
    aiQuotaMonthly,
    aiQuotaPeriod: row.ai_quota_period,
    isQuotaExceeded: aiQuotaUsed >= aiQuotaMonthly
  };
}

export async function getBillingProfile(admin: SupabaseAdminClient, userId: string) {
  const { data, error } = await admin
    .from("profiles")
    .select(BILLING_PROFILE_SELECT)
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return (data as BillingProfileRow | null) ?? null;
}

export async function ensureBillingProfile(admin: SupabaseAdminClient, user: User) {
  const existingProfile = await getBillingProfile(admin, user.id);

  if (existingProfile) {
    return existingProfile;
  }

  const { data, error } = await admin
    .from("profiles")
    .upsert(
      {
        id: user.id,
        email: user.email ?? null,
        plan: "free",
        ai_quota_monthly: FREE_AI_QUOTA_MONTHLY,
        ai_quota_used: 0,
        ai_quota_period: getCurrentAiQuotaPeriod()
      },
      { onConflict: "id" }
    )
    .select(BILLING_PROFILE_SELECT)
    .single();

  if (error || !data) {
    throw error ?? new Error("Failed to create billing profile.");
  }

  return data as BillingProfileRow;
}

export async function ensureCurrentAiQuota(
  admin: SupabaseAdminClient,
  profile: BillingProfileRow
) {
  const usage = normalizeAiQuota(profile);
  const updates: Partial<BillingProfileRow> = {};

  if (profile.ai_quota_period !== usage.aiQuotaPeriod) {
    updates.ai_quota_used = 0;
    updates.ai_quota_period = usage.aiQuotaPeriod;
  }

  if (Number(profile.ai_quota_monthly ?? 0) !== usage.aiQuotaMonthly) {
    updates.ai_quota_monthly = usage.aiQuotaMonthly;
  }

  if (Object.keys(updates).length === 0) {
    return {
      profile,
      usage
    };
  }

  const { data, error } = await admin
    .from("profiles")
    .update(updates)
    .eq("id", profile.id)
    .select(BILLING_PROFILE_SELECT)
    .single();

  if (error || !data) {
    throw error ?? new Error("Failed to refresh AI quota.");
  }

  const refreshedProfile = data as BillingProfileRow;

  return {
    profile: refreshedProfile,
    usage: normalizeAiQuota(refreshedProfile)
  };
}

export async function recordAiReportUsage(
  admin: SupabaseAdminClient,
  profile: BillingProfileRow,
  sessionId: string
) {
  const effectivePlan = getEffectivePlan(profile);
  const { data, error } = await admin
    .rpc("record_ai_usage", {
      p_user_id: profile.id,
      p_session_id: sessionId,
      p_usage_type: "ai_report",
      p_period: getCurrentAiQuotaPeriod(),
      p_plan: effectivePlan,
      p_ai_quota_monthly: getAiQuotaMonthlyForPlan(effectivePlan)
    })
    .single();

  if (error || !data) {
    throw error ?? new Error("Failed to record AI usage.");
  }

  return toAiQuotaUsage(data as RecordAiUsageRow);
}
