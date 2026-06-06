"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

type WorkoutSet = {
  id: string;
  exercise_name: string;
  weight: number | string;
  reps: number;
  set_order: number;
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
};

type SessionDetail = {
  id: string;
  session_date: string;
  title: string | null;
  workout_sets: WorkoutSet[];
  ai_reports: AiReport[];
};

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

  function hasReportContent(nextReport: AiReport | null | undefined) {
    return Boolean(
      nextReport?.summary ||
        nextReport?.comparison ||
        nextReport?.good_points ||
        nextReport?.cautions ||
        nextReport?.next_workout
    );
  }

  const fetchLatestReport = useCallback(async () => {
    const { data, error: reportError } = await supabase
      .from("ai_reports")
      .select(
        "id, session_id, user_id, summary, comparison, good_points, cautions, next_workout"
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

    const { data, error: loadError } = await supabase
      .from("workout_sessions")
      .select(
        "id, session_date, title, workout_sets(id, exercise_name, weight, reps, set_order)"
      )
      .eq("id", sessionId)
      .single();

    if (loadError) {
      setError(loadError.message);
    } else {
      const detail = data as SessionDetail;
      setSession(detail);
      const latestReport = await fetchLatestReport();
      setReport(hasReportContent(latestReport) ? latestReport : null);
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

    let payload: { report?: AiReport; error?: string };

    try {
      payload = (await response.json()) as { report?: AiReport; error?: string };
    } catch {
      payload = { error: "AI診断APIのレスポンスをJSONとして読めませんでした。" };
    }

    console.log("ai report response body", payload);

    if (!response.ok) {
      setError(payload.error ?? "AI診断の生成に失敗しました。");
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

      {session ? (
        <section className="panel">
          <h2>{session.title || "トレーニング"}</h2>
          <div className="history-card__sets">
            {session.workout_sets
              .slice()
              .sort((a, b) => a.set_order - b.set_order)
              .map((set) => (
                <span className="pill" key={set.id}>
                  {set.exercise_name} {Number(set.weight)}kg x {set.reps}
                </span>
              ))}
          </div>
        </section>
      ) : null}

      {!report ? (
        <button
          className="button full"
          type="button"
          disabled={generating || !session}
          onClick={generateReport}
        >
          {generating ? "診断生成中" : "AI診断を生成"}
        </button>
      ) : null}

      {report ? (
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

      <Link className="button secondary full" href="/">
        ホームへ戻る
      </Link>
    </div>
  );
}
