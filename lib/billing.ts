export const FREE_AI_QUOTA_MONTHLY = 3;
export const PRO_AI_QUOTA_MONTHLY = 30;

export type EffectivePlan = "free" | "pro";

export type BillingProfile = {
  plan?: string | null;
  subscription_status?: string | null;
  ai_quota_monthly?: number | null;
  ai_quota_used?: number | null;
  ai_quota_period?: string | null;
};

export type AiQuotaUsage = {
  plan: EffectivePlan;
  planLabel: "Free" | "Pro";
  aiQuotaUsed: number;
  aiQuotaMonthly: number;
  aiQuotaPeriod: string;
  ai_quota_used: number;
  ai_quota_monthly: number;
  ai_quota_period: string;
  isQuotaExceeded: boolean;
};

const activeSubscriptionStatuses = new Set(["active", "trialing"]);

export function getCurrentAiQuotaPeriod(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit"
  }).formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;

  return `${year}-${month}`;
}

export function getEffectivePlan(profile: BillingProfile | null | undefined): EffectivePlan {
  if (
    profile?.plan === "pro" &&
    profile.subscription_status &&
    activeSubscriptionStatuses.has(profile.subscription_status)
  ) {
    return "pro";
  }

  return "free";
}

export function getAiQuotaMonthlyForPlan(plan: EffectivePlan) {
  return plan === "pro" ? PRO_AI_QUOTA_MONTHLY : FREE_AI_QUOTA_MONTHLY;
}

export function normalizeAiQuota(
  profile: BillingProfile | null | undefined,
  date = new Date()
): AiQuotaUsage {
  const plan = getEffectivePlan(profile);
  const aiQuotaPeriod = getCurrentAiQuotaPeriod(date);
  const aiQuotaMonthly = getAiQuotaMonthlyForPlan(plan);
  const periodMatches = profile?.ai_quota_period === aiQuotaPeriod;
  const rawUsed = periodMatches ? Number(profile?.ai_quota_used ?? 0) : 0;
  const aiQuotaUsed = Number.isFinite(rawUsed) ? Math.max(0, rawUsed) : 0;

  return {
    plan,
    planLabel: plan === "pro" ? "Pro" : "Free",
    aiQuotaUsed,
    aiQuotaMonthly,
    aiQuotaPeriod,
    ai_quota_used: aiQuotaUsed,
    ai_quota_monthly: aiQuotaMonthly,
    ai_quota_period: aiQuotaPeriod,
    isQuotaExceeded: aiQuotaUsed >= aiQuotaMonthly
  };
}
