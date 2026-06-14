import type { User } from "@supabase/supabase-js";

import {
  type AiQuotaUsage,
  type BillingProfile,
  FREE_AI_QUOTA_MONTHLY,
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

export type RecordAiReportUsageResult = {
  usage: AiQuotaUsage;
  usageLogInserted: boolean;
};

type RecordAiUsageRow = {
  plan: "free" | "pro";
  ai_quota_used: number;
  ai_quota_monthly: number;
  ai_quota_period: string;
};

export function summarizeSupabaseError(error: unknown) {
  if (!error || typeof error !== "object") {
    return { message: error instanceof Error ? error.message : "Unknown error." };
  }

  const record = error as Record<string, unknown>;

  return {
    message: String(record.message ?? "Unknown error."),
    code: record.code ? String(record.code) : undefined,
    details: record.details ? String(record.details) : undefined,
    hint: record.hint ? String(record.hint) : undefined
  };
}

function toAiQuotaUsage(row: RecordAiUsageRow): AiQuotaUsage {
  const aiQuotaUsed = Number(row.ai_quota_used ?? 0);
  const aiQuotaMonthly = Number(row.ai_quota_monthly ?? FREE_AI_QUOTA_MONTHLY);

  return {
    plan: row.plan,
    planLabel: row.plan === "pro" ? "Pro" : "Free",
    aiQuotaUsed,
    aiQuotaMonthly,
    aiQuotaPeriod: row.ai_quota_period,
    ai_quota_used: aiQuotaUsed,
    ai_quota_monthly: aiQuotaMonthly,
    ai_quota_period: row.ai_quota_period,
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
    console.error("quota profile fetch error", {
      userId,
      error: summarizeSupabaseError(error)
    });
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
    console.error("quota profile fetch error", {
      userId: user.id,
      operation: "create_profile",
      error: error ? summarizeSupabaseError(error) : { message: "Profile insert returned no data." }
    });
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
    console.error("quota reset error", {
      userId: profile.id,
      period: usage.aiQuotaPeriod,
      plan: usage.plan,
      error: error ? summarizeSupabaseError(error) : { message: "Quota reset returned no data." }
    });
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
): Promise<RecordAiReportUsageResult> {
  const latestProfile = await getBillingProfile(admin, profile.id);

  if (!latestProfile) {
    const error = new Error("Billing profile was not found while recording AI usage.");
    console.error("quota profile fetch error", {
      userId: profile.id,
      sessionId,
      error: { message: error.message }
    });
    throw error;
  }

  const { profile: currentProfile, usage } = await ensureCurrentAiQuota(admin, latestProfile);

  if (usage.isQuotaExceeded) {
    const error = new Error("AI quota was exceeded before increment.");
    console.error("quota increment error", {
      userId: currentProfile.id,
      sessionId,
      period: usage.aiQuotaPeriod,
      used: usage.aiQuotaUsed,
      monthly: usage.aiQuotaMonthly,
      error: { message: error.message }
    });
    throw error;
  }

  const nextUsed = usage.aiQuotaUsed + 1;
  const { data: updatedProfile, error: incrementError } = await admin
    .from("profiles")
    .update({
      ai_quota_used: nextUsed,
      ai_quota_monthly: usage.aiQuotaMonthly,
      ai_quota_period: usage.aiQuotaPeriod
    })
    .eq("id", currentProfile.id)
    .select("plan, subscription_status, ai_quota_monthly, ai_quota_used, ai_quota_period")
    .single();

  if (incrementError || !updatedProfile) {
    console.error("quota increment error", {
      userId: currentProfile.id,
      sessionId,
      period: usage.aiQuotaPeriod,
      usedBefore: usage.aiQuotaUsed,
      nextUsed,
      error: incrementError
        ? summarizeSupabaseError(incrementError)
        : { message: "Quota increment returned no data." }
    });
    throw incrementError ?? new Error("Failed to increment AI quota.");
  }

  const effectivePlan = getEffectivePlan(updatedProfile as BillingProfile);
  const logPeriod = String(updatedProfile.ai_quota_period ?? usage.aiQuotaPeriod);
  let usageLogInserted = true;
  const { error: logError } = await admin.from("ai_usage_logs").insert({
    user_id: currentProfile.id,
    session_id: sessionId,
    usage_type: "ai_report",
    plan: effectivePlan,
    period: logPeriod,
    created_at: new Date().toISOString()
  });

  if (logError) {
    console.error("ai_usage_logs insert error", {
      userId: currentProfile.id,
      sessionId,
      period: logPeriod,
      plan: effectivePlan,
      error: summarizeSupabaseError(logError)
    });
    usageLogInserted = false;
  }

  const refreshedProfile = await getBillingProfile(admin, currentProfile.id);

  if (!refreshedProfile) {
    const error = new Error("Billing profile was not found after AI usage update.");
    console.error("quota profile fetch error", {
      userId: currentProfile.id,
      sessionId,
      operation: "fetch_after_increment",
      error: { message: error.message }
    });
    throw error;
  }

  const latestUsage = normalizeAiQuota(refreshedProfile);

  console.log("usage update success", {
    userId: currentProfile.id,
    sessionId,
    plan: latestUsage.plan,
    aiQuotaUsed: latestUsage.aiQuotaUsed,
    aiQuotaMonthly: latestUsage.aiQuotaMonthly,
    aiQuotaPeriod: latestUsage.aiQuotaPeriod,
    usageLogInserted
  });
  console.log("latest usage returned", {
    userId: currentProfile.id,
    sessionId,
    usage: {
      plan: latestUsage.plan,
      ai_quota_used: latestUsage.ai_quota_used,
      ai_quota_monthly: latestUsage.ai_quota_monthly,
      ai_quota_period: latestUsage.ai_quota_period
    }
  });

  return {
    usage: latestUsage,
    usageLogInserted
  };
}
