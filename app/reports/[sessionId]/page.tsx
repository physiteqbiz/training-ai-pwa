"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  type AiQuotaUsage,
  type BillingProfile,
  normalizeAiQuota
} from "@/lib/billing";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import {
  formatWeight,
  formatWeightNumber,
  normalizeWeightUnit,
  type WeightUnit
} from "@/lib/weight-unit";

type WorkoutSet = {
  id: string;
  exercise_name: string;
  weight: number | string;
  reps: number;
  set_order: number;
  exercise_order?: number;
};

type AiReport = {
  id: string;
  session_id?: string;
  user_id?: string;
  summary: string | null;
  comparison: string | null;
  good_points: string | null;
  cautions: string | null;
  next_workout: string | null;
  raw_json?: unknown;
};

type SuggestedSet = {
  weight: number;
  reps: number;
  sets: number;
  note: string;
};

type TargetLine = {
  weight: number;
  reps: string;
  sets: string;
  note: string;
  text: string;
};

type SuggestedTargets = {
  strength_target: TargetLine[];
  hypertrophy_target: TargetLine[];
  fatigue_management_target: TargetLine[];
};

type ExerciseReportMeta = {
  estimatedOneRepMax: number | null;
  workingSetCount: number;
  assistedSetCount: number;
  dropSetCount: number;
  mainSetCount: number;
  normalSetCount: number;
  suggestedTargets: SuggestedTargets | null;
};

type ExerciseDiagnostic = {
  exercise_name: string;
  label: string;
  analysis: string;
  previous_comparison: string;
  next_target: string;
  suggested_sets: SuggestedSet[];
};

type AiReportV2 = {
  overall_score?: number;
  overall_label?: string;
  summary: string;
  progress_highlight?: string;
  comparison: string;
  exercise_diagnostics: ExerciseDiagnostic[];
  goal_based_advice?: string;
  priority_focus?: string;
  cautions: string;
  next_workout: string;
};

type AiReportStatus = "not_generated" | "generated" | "stale";

type SessionDetail = {
  id: string;
  session_date: string;
  title: string | null;
  ai_report_status: AiReportStatus;
  workout_sets: WorkoutSet[];
  ai_reports: AiReport[];
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function normalizeScoreToHundred(value: unknown) {
  if (value === undefined || value === null) {
    return undefined;
  }

  const score = Number(value);

  if (!Number.isFinite(score)) {
    return undefined;
  }

  const normalized = score <= 10 ? score * 10 : score;

  return Math.round(Math.max(0, Math.min(100, normalized)));
}

function normalizeSuggestedSets(value: unknown): SuggestedSet[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((item) => {
    const record = asRecord(item);

    return {
      weight: Number(record.weight ?? 0),
      reps: Number(record.reps ?? 0),
      sets: Number(record.sets ?? 0),
      note: String(record.note ?? "")
    };
  });
}

function normalizeTargetLines(value: unknown): TargetLine[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((item) => {
    const record = asRecord(item);
    const displayUnit = normalizeWeightUnit(record.display_unit);
    const weight = Number(record.display_weight ?? record.weight ?? 0);
    const reps = String(record.reps ?? "");
    const sets = String(record.sets ?? "");
    const note = String(record.note ?? "");
    const text = String(
      record.text ??
        `${formatWeightNumber(weight)}${displayUnit} × ${reps}回 × ${sets}セット`
    );

    return { weight, reps, sets, note, text };
  });
}

function normalizeSuggestedTargets(value: unknown): SuggestedTargets | null {
  const record = asRecord(value);
  const targets = {
    strength_target: normalizeTargetLines(record.strength_target),
    hypertrophy_target: normalizeTargetLines(record.hypertrophy_target),
    fatigue_management_target: normalizeTargetLines(record.fatigue_management_target)
  };

  return targets.strength_target.length ||
    targets.hypertrophy_target.length ||
    targets.fatigue_management_target.length
    ? targets
    : null;
}

function buildExerciseReportMeta(value: unknown) {
  const raw = asRecord(value);
  const computedAnalysis = asRecord(raw.computed_analysis);
  const topLevelTargets = asRecord(raw.suggested_targets);
  const exercises = Array.isArray(computedAnalysis.exercises_summary)
    ? computedAnalysis.exercises_summary
    : [];
  const meta = new Map<string, ExerciseReportMeta>();

  for (const item of exercises) {
    const exercise = asRecord(item);
    const exerciseName = String(exercise.exercise_name ?? "");

    if (!exerciseName) {
      continue;
    }

    const setTypeCounts = asRecord(exercise.set_type_counts);
    const suggestedTargets =
      normalizeSuggestedTargets(exercise.suggested_targets) ??
      normalizeSuggestedTargets(topLevelTargets[exerciseName]);

    meta.set(exerciseName, {
      estimatedOneRepMax:
        exercise.estimated_1rm_from_rm_eligible_sets === null ||
        exercise.estimated_1rm_from_rm_eligible_sets === undefined
          ? null
          : Number(exercise.estimated_1rm_from_rm_eligible_sets),
      workingSetCount: Number(exercise.working_set_count ?? 0),
      assistedSetCount: Number(exercise.assisted_set_count ?? 0),
      dropSetCount: Number(setTypeCounts.drop ?? 0),
      mainSetCount: Number(setTypeCounts.main ?? 0),
      normalSetCount: Number(setTypeCounts.normal ?? 0),
      suggestedTargets
    });
  }

  return meta;
}

function normalizeV2Report(value: unknown): AiReportV2 | null {
  const raw = asRecord(value);
  const response = asRecord(raw.response);
  const source = Object.keys(response).length ? response : raw;
  const diagnostics = Array.isArray(source.exercise_diagnostics)
    ? source.exercise_diagnostics
    : [];

  if (!source.summary || diagnostics.length === 0) {
    return null;
  }

  return {
    overall_score: normalizeScoreToHundred(source.overall_score),
    overall_label:
      source.overall_label === undefined || source.overall_label === null
        ? undefined
        : String(source.overall_label),
    summary: String(source.summary ?? ""),
    progress_highlight:
      source.progress_highlight === undefined || source.progress_highlight === null
        ? undefined
        : String(source.progress_highlight),
    comparison: String(source.comparison ?? ""),
    exercise_diagnostics: diagnostics
      .map((item) => {
        const diagnostic = asRecord(item);

        return {
          exercise_name: String(diagnostic.exercise_name ?? ""),
          label: String(diagnostic.label ?? ""),
          analysis: String(diagnostic.analysis ?? ""),
          previous_comparison: String(diagnostic.previous_comparison ?? ""),
          next_target: String(diagnostic.next_target ?? ""),
          suggested_sets: normalizeSuggestedSets(diagnostic.suggested_sets)
        };
      })
      .filter((item) => item.exercise_name),
    goal_based_advice:
      source.goal_based_advice === undefined || source.goal_based_advice === null
        ? undefined
        : String(source.goal_based_advice),
    priority_focus:
      source.priority_focus === undefined || source.priority_focus === null
        ? undefined
        : String(source.priority_focus),
    cautions: String(source.cautions ?? ""),
    next_workout: String(source.next_workout ?? "")
  };
}

export default function ReportPage() {
  const params = useParams<{ sessionId: string }>();
  const sessionId = params.sessionId;
  const router = useRouter();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [session, setSession] = useState<SessionDetail | null>(null);
  const [report, setReport] = useState<AiReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");
  const [billingProfile, setBillingProfile] = useState<BillingProfile | null>(null);
  const [usageOverride, setUsageOverride] = useState<AiQuotaUsage | null>(null);
  const [weightUnit, setWeightUnit] = useState<WeightUnit>("kg");
  const reportV2 = useMemo(() => normalizeV2Report(report?.raw_json), [report]);
  const exerciseReportMeta = useMemo(
    () => buildExerciseReportMeta(report?.raw_json),
    [report]
  );
  const aiQuota = useMemo(
    () => usageOverride ?? normalizeAiQuota(billingProfile),
    [billingProfile, usageOverride]
  );

  const exerciseSummaries = useMemo(() => {
    const grouped = new Map<string, WorkoutSet[]>();

    for (const set of session?.workout_sets ?? []) {
      const current = grouped.get(set.exercise_name) ?? [];
      current.push(set);
      grouped.set(set.exercise_name, current);
    }

    return Array.from(grouped.entries()).map(([exerciseName, sets]) => ({
      exerciseName,
      sets: sets.slice().sort((a, b) => a.set_order - b.set_order)
    }));
  }, [session]);

  function hasReportContent(nextReport: AiReport | null | undefined) {
    return Boolean(
      nextReport?.summary ||
        nextReport?.comparison ||
        nextReport?.good_points ||
        nextReport?.cautions ||
        nextReport?.next_workout
    );
  }

  const aiReportStatus = session?.ai_report_status ?? "not_generated";
  const generateButtonLabel =
    aiReportStatus === "stale" ? "AI診断を再生成" : "AI診断を生成";
  const reportStatusMessage =
    aiReportStatus === "stale"
      ? "セッション内容が更新されたため、AI診断の再生成が必要です。"
      : aiReportStatus === "generated"
        ? "AI診断結果が見つかりません。再生成してください。"
        : "このセッションのAI診断はまだ生成されていません。";

  const fetchLatestReport = useCallback(async () => {
    const { data, error: reportError } = await supabase
      .from("ai_reports")
      .select(
        "id, session_id, user_id, summary, comparison, good_points, cautions, next_workout, raw_json"
      )
      .eq("session_id", sessionId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (reportError) {
      setError(reportError.message);
      return null;
    }

    return (data as AiReport | null) ?? null;
  }, [sessionId, supabase]);

  const load = useCallback(async () => {
    setLoading(true);
    const {
      data: { user }
    } = await supabase.auth.getUser();

    if (!user) {
      router.replace("/login");
      return;
    }

    const [sessionResult, billingResult, inputSettingsResult] = await Promise.all([
      supabase
        .from("workout_sessions")
        .select(
          "id, session_date, title, ai_report_status, workout_sets(id, exercise_name, weight, reps, set_order, exercise_order)"
        )
        .eq("id", sessionId)
        .single(),
      supabase
        .from("profiles")
        .select("plan, subscription_status, ai_quota_monthly, ai_quota_used, ai_quota_period")
        .eq("id", user.id)
        .maybeSingle(),
      supabase
        .from("user_fitness_profiles")
        .select("weight_unit")
        .eq("user_id", user.id)
        .maybeSingle()
    ]);

    if (sessionResult.error) {
      setError(sessionResult.error.message);
    } else {
      const detail = sessionResult.data as SessionDetail;
      setSession(detail);
      const latestReport = await fetchLatestReport();
      setReport(
        detail.ai_report_status === "generated" && hasReportContent(latestReport)
          ? latestReport
          : null
      );
    }

    if (!billingResult.error) {
      setBillingProfile((billingResult.data as BillingProfile | null) ?? null);
      setUsageOverride(null);
    }

    if (!inputSettingsResult.error && inputSettingsResult.data) {
      setWeightUnit(normalizeWeightUnit(inputSettingsResult.data.weight_unit));
    }

    setLoading(false);
  }, [fetchLatestReport, router, sessionId, supabase]);

  const generateReport = useCallback(async () => {
    console.log("ai report request started");
    setGenerating(true);
    setError("");

    const {
      data: { session: authSession }
    } = await supabase.auth.getSession();

    const response = await fetch("/api/ai-report", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(authSession?.access_token
          ? { Authorization: `Bearer ${authSession.access_token}` }
          : {})
      },
      body: JSON.stringify({ workout_session_id: sessionId })
    });

    console.log("ai report response status", response.status);

    let payload: {
      ok?: boolean;
      partial_success?: boolean;
      report?: AiReport;
      usage?: AiQuotaUsage;
      error?: string;
      message?: string;
      report_saved?: boolean;
    };

    try {
      payload = (await response.json()) as {
        ok?: boolean;
        partial_success?: boolean;
        report?: AiReport;
        usage?: AiQuotaUsage;
        error?: string;
        message?: string;
        report_saved?: boolean;
      };
    } catch {
      payload = { error: "AI診断APIのレスポンスをJSONとして読めませんでした。" };
    }

    console.log("ai report response body", payload);

    if (!response.ok) {
      if (payload.usage) {
        setUsageOverride(payload.usage);
      }
      const savedReport = hasReportContent(payload.report)
        ? payload.report ?? null
        : await fetchLatestReport();

      if (hasReportContent(savedReport)) {
        setReport(savedReport);
        setSession((current) =>
          current ? { ...current, ai_report_status: "generated" } : current
        );
        setError(
          payload.partial_success
            ? "AI診断は保存済みです。利用回数の更新に失敗したため、反映後に再読み込みしてください。"
            : ""
        );
        setGenerating(false);
        router.refresh();
        return;
      }

      setError(payload.error ?? "AI診断の生成に失敗しました。");
      setGenerating(false);
      return;
    }

    if (payload.ok === false || payload.partial_success) {
      setError(payload.message ?? payload.error ?? "AI診断の生成に失敗しました。");
      setGenerating(false);
      return;
    }

    if (!hasReportContent(payload.report)) {
      setError("AI診断結果が空です。");
      setGenerating(false);
      return;
    }

    setReport(payload.report ?? null);

    const latestReport = await fetchLatestReport();

    if (hasReportContent(latestReport)) {
      setReport(latestReport);
      console.log("ai report saved/displayed", latestReport);
    } else {
      console.log("ai report saved/displayed", payload.report);
    }

    setSession((current) =>
      current ? { ...current, ai_report_status: "generated" } : current
    );
    if (payload.usage) {
      setUsageOverride(payload.usage);
    }
    setError("");
    setGenerating(false);
    router.refresh();
  }, [fetchLatestReport, router, sessionId, supabase]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="screen">
      <header className="screen-header">
        <p className="eyebrow">AI Report</p>
        <h1>AI診断</h1>
        <p className="muted">{session?.session_date ?? ""}</p>
      </header>

      {loading ? <div className="status">読込中です。</div> : null}
      {error ? <div className="status error">{error}</div> : null}

      <section className="panel compact-panel">
        <div className="row">
          <h2>AI診断 利用状況</h2>
          <span className="status-badge">{aiQuota.planLabel}</span>
        </div>
        <p className="muted">
          AI診断 今月 {aiQuota.aiQuotaUsed} / {aiQuota.aiQuotaMonthly}回
        </p>
        {aiQuota.isQuotaExceeded ? (
          <div className="stack">
            <div className="status">
              今月のAI診断回数を使い切りました。Proにすると月30回まで利用できます。
            </div>
            <Link className="button full" href="/pricing">
              Proを見る
            </Link>
          </div>
        ) : null}
      </section>

      {session ? (
        <section className="panel">
          <h2>{session.title || "トレーニング"}</h2>
          <div className="previous-list">
            {exerciseSummaries.map((summary) => (
              <div className="previous-row" key={summary.exerciseName}>
                <div>
                  <strong>{summary.exerciseName}</strong>
                  <span>{summary.sets.length}セット</span>
                </div>
                <p>
                  {summary.sets
                    .map((set) => `${formatWeight(set.weight, weightUnit)} × ${set.reps}`)
                    .join(" / ")}
                </p>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {!report ? (
        <section className="panel">
          <p className="muted">{reportStatusMessage}</p>
          <button
            className="button full"
            type="button"
            disabled={generating || !session || aiQuota.isQuotaExceeded}
            onClick={generateReport}
          >
            {generating ? "診断生成中" : generateButtonLabel}
          </button>
        </section>
      ) : null}

      {report && reportV2 ? (
        <section className="stack">
          <article className="report-section score-section">
            <p className="eyebrow">総合評価</p>
            <div className="score-row">
              {reportV2.overall_score !== undefined ? (
                <strong>{reportV2.overall_score}点</strong>
              ) : null}
              {reportV2.overall_label ? <span>{reportV2.overall_label}</span> : null}
            </div>
            <p>{reportV2.summary}</p>
          </article>

          {reportV2.progress_highlight ? (
            <article className="report-section">
              <h2>今日の伸び</h2>
              <p>{reportV2.progress_highlight}</p>
            </article>
          ) : null}

          <section className="stack">
            <h2>種目別診断</h2>
            {reportV2.exercise_diagnostics.map((diagnostic) => {
              const meta = exerciseReportMeta.get(diagnostic.exercise_name);

              return (
                <article className="exercise-diagnostic-card" key={diagnostic.exercise_name}>
                  <div className="row">
                    <h3>{diagnostic.exercise_name}</h3>
                    {diagnostic.label ? <span className="status-badge">{diagnostic.label}</span> : null}
                  </div>
                  {meta ? (
                    <div className="metric-grid">
                      <div>
                        <span>推定1RM</span>
                        <strong>
                          {meta.estimatedOneRepMax === null
                            ? "-"
                            : formatWeight(meta.estimatedOneRepMax, weightUnit)}
                        </strong>
                      </div>
                      <div>
                        <span>メイン/通常</span>
                        <strong>{meta.mainSetCount + meta.normalSetCount}セット</strong>
                      </div>
                      <div>
                        <span>補助あり</span>
                        <strong>{meta.assistedSetCount}セット</strong>
                      </div>
                      <div>
                        <span>ドロップ</span>
                        <strong>{meta.dropSetCount}セット</strong>
                      </div>
                    </div>
                  ) : null}
                  <p>{diagnostic.analysis}</p>
                  {diagnostic.previous_comparison ? (
                    <div className="status">
                      <strong>前回比</strong>
                      <p>{diagnostic.previous_comparison}</p>
                    </div>
                  ) : null}
                  {diagnostic.next_target ? (
                    <div className="status">
                      <strong>次回目標</strong>
                      <p>{diagnostic.next_target}</p>
                    </div>
                  ) : null}
                  {diagnostic.suggested_sets.length ? (
                    <div className="stack">
                      <h3>次回候補</h3>
                      <div className="suggested-set-list">
                        {diagnostic.suggested_sets.map((set, index) => (
                          <div className="suggested-set" key={`${diagnostic.exercise_name}-${index}`}>
                            <strong>
                              {formatWeightNumber(set.weight)}
                              {weightUnit} × {set.reps}回 × {set.sets}セット
                            </strong>
                            {set.note ? <span>{set.note}</span> : null}
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                  {meta?.suggestedTargets ? (
                    <div className="stack">
                      <h3>目的別候補</h3>
                      <div className="target-grid">
                        <div className="target-card">
                          <strong>筋力アップ優先</strong>
                          {meta.suggestedTargets.strength_target.map((target, index) => (
                            <p key={`strength-${diagnostic.exercise_name}-${index}`}>
                              {target.text}
                            </p>
                          ))}
                        </div>
                        <div className="target-card">
                          <strong>筋肥大優先</strong>
                          {meta.suggestedTargets.hypertrophy_target.map((target, index) => (
                            <p key={`hypertrophy-${diagnostic.exercise_name}-${index}`}>
                              {target.text}
                            </p>
                          ))}
                        </div>
                        <div className="target-card">
                          <strong>疲労管理</strong>
                          {meta.suggestedTargets.fatigue_management_target.map((target, index) => (
                            <p key={`fatigue-${diagnostic.exercise_name}-${index}`}>
                              {target.text}
                            </p>
                          ))}
                        </div>
                      </div>
                    </div>
                  ) : null}
                </article>
              );
            })}
          </section>

          {reportV2.goal_based_advice ? (
            <article className="report-section">
              <h2>目的別アドバイス</h2>
              <p>{reportV2.goal_based_advice}</p>
            </article>
          ) : null}

          {reportV2.priority_focus ? (
            <article className="report-section">
              <h2>優先ポイント</h2>
              <p>{reportV2.priority_focus}</p>
            </article>
          ) : null}

          <article className="report-section">
            <h2>注意点</h2>
            <p>{reportV2.cautions}</p>
          </article>
          <article className="report-section">
            <h2>次回メニュー</h2>
            <p>{reportV2.next_workout}</p>
          </article>
        </section>
      ) : null}

      {report && !reportV2 ? (
        <section className="stack">
          <article className="report-section">
            <h2>今日のトレーニング要約</h2>
            <p>{report.summary}</p>
          </article>
          <article className="report-section">
            <h2>前回比</h2>
            <p>{report.comparison}</p>
          </article>
          <article className="report-section">
            <h2>良かった点</h2>
            <p>{report.good_points}</p>
          </article>
          <article className="report-section">
            <h2>注意点</h2>
            <p>{report.cautions}</p>
          </article>
          <article className="report-section">
            <h2>次回メニュー提案</h2>
            <p>{report.next_workout}</p>
          </article>
        </section>
      ) : null}

      <p className="fine-print">
        AI診断はトレーニング記録に基づく一般的なフィットネス助言です。痛みや体調不良がある場合は専門家に相談してください。
      </p>

      <Link className="button secondary full" href="/">
        ホームへ戻る
      </Link>
    </div>
  );
}
