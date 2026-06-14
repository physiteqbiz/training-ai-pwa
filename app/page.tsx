"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { type BillingProfile, normalizeAiQuota } from "@/lib/billing";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

type WorkoutSet = {
  exercise_name: string;
  weight: number | string;
  reps: number;
  set_order: number;
  exercise_order?: number;
};

type AiReportStatus = "not_generated" | "generated" | "stale";

type WorkoutSession = {
  id: string;
  session_date: string;
  title: string | null;
  created_at: string;
  ai_report_status?: AiReportStatus;
  workout_sets: WorkoutSet[];
  ai_reports: { id: string; created_at: string }[];
};

type ExerciseGroup = {
  exerciseName: string;
  sets: WorkoutSet[];
};

function groupSetsByExercise(sets: WorkoutSet[]) {
  const grouped = new Map<string, WorkoutSet[]>();

  for (const set of sets.slice().sort((a, b) => {
    const aExerciseOrder = a.exercise_order ?? 0;
    const bExerciseOrder = b.exercise_order ?? 0;

    return aExerciseOrder - bExerciseOrder || a.set_order - b.set_order;
  })) {
    const current = grouped.get(set.exercise_name) ?? [];
    current.push(set);
    grouped.set(set.exercise_name, current);
  }

  return Array.from(grouped.entries()).map(([exerciseName, groupedSets]) => ({
    exerciseName,
    sets: groupedSets
  }));
}

function getAiReportStatus(session: WorkoutSession): AiReportStatus {
  return session.ai_report_status ?? (session.ai_reports?.length ? "generated" : "not_generated");
}

function getAiReportStatusLabel(status: AiReportStatus) {
  if (status === "generated") {
    return "AI診断：生成済み";
  }

  if (status === "stale") {
    return "AI診断：要再生成";
  }

  return "AI診断：未生成";
}

function getAiReportActionLabel(status: AiReportStatus) {
  if (status === "generated") {
    return "AI診断を見る";
  }

  if (status === "stale") {
    return "AI診断を再生成";
  }

  return "AI診断を生成";
}

function isStandaloneDisplay() {
  if (typeof window === "undefined") {
    return false;
  }

  const navigatorWithStandalone = window.navigator as Navigator & { standalone?: boolean };

  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    navigatorWithStandalone.standalone === true
  );
}

export default function HomePage() {
  const router = useRouter();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [email, setEmail] = useState("");
  const [sessions, setSessions] = useState<WorkoutSession[]>([]);
  const [billingProfile, setBillingProfile] = useState<BillingProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showInstallGuide, setShowInstallGuide] = useState(false);
  const aiQuota = useMemo(() => normalizeAiQuota(billingProfile), [billingProfile]);

  useEffect(() => {
    const hidden = window.localStorage.getItem("hideInstallGuide") === "true";
    setShowInstallGuide(!hidden && !isStandaloneDisplay());
  }, []);

  useEffect(() => {
    let active = true;

    async function load() {
      const {
        data: { user }
      } = await supabase.auth.getUser();

      if (!user) {
        router.replace("/login");
        return;
      }

      if (!active) {
        return;
      }

      setEmail(user.email ?? "");

      const [sessionsResult, billingResult] = await Promise.all([
        supabase
          .from("workout_sessions")
          .select(
            "id, session_date, title, created_at, ai_report_status, workout_sets(exercise_name, weight, reps, set_order, exercise_order), ai_reports(id, created_at)"
          )
          .order("session_date", { ascending: false })
          .order("created_at", { ascending: false })
          .limit(8),
        supabase
          .from("profiles")
          .select("plan, subscription_status, ai_quota_monthly, ai_quota_used, ai_quota_period")
          .eq("id", user.id)
          .maybeSingle()
      ]);

      if (!active) {
        return;
      }

      if (sessionsResult.error) {
        setError(sessionsResult.error.message);
      } else {
        setSessions((sessionsResult.data ?? []) as WorkoutSession[]);
      }

      if (!billingResult.error) {
        setBillingProfile((billingResult.data as BillingProfile | null) ?? null);
      }

      setLoading(false);
    }

    void load();

    return () => {
      active = false;
    };
  }, [router, supabase]);

  const latestReportSession = sessions.find(
    (session) => getAiReportStatus(session) === "generated"
  );
  const visibleSessions = sessions.filter(
    (session, index, current) =>
      current.findIndex((candidate) => candidate.session_date === session.session_date) === index
  );

  return (
    <div className="screen">
      <header className="screen-header">
        <p className="eyebrow">Training AI</p>
        <h1>今日の記録を残す</h1>
        <p className="muted">{email || "ログイン確認中"}</p>
      </header>

      <Link className="button full" href="/workouts/new">
        今日のトレーニングを記録する
      </Link>

      {latestReportSession ? (
        <Link className="button secondary full" href={`/reports/${latestReportSession.id}`}>
          最新AI診断を見る
        </Link>
      ) : (
        <div className="status">AI診断はセッション保存後に生成できます。</div>
      )}

      <section className="panel compact-panel">
        <div className="row">
          <h2>AI診断</h2>
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

      {showInstallGuide ? (
        <section className="install-card">
          <div className="stack">
            <div>
              <p className="eyebrow">スマホに追加</p>
              <h2>アプリのように使う</h2>
            </div>
            <p className="muted">
              ホーム画面に追加すると、次回から1タップでトレーニング記録を開けます。
            </p>
          </div>
          <div className="install-card__actions">
            <Link className="button secondary" href="/install">
              追加方法を見る
            </Link>
            <button
              className="button ghost"
              type="button"
              onClick={() => {
                window.localStorage.setItem("hideInstallGuide", "true");
                setShowInstallGuide(false);
              }}
            >
              閉じる
            </button>
          </div>
        </section>
      ) : null}

      <section className="panel">
        <div className="row">
          <h2>直近の履歴</h2>
          {loading ? <span className="muted">読込中</span> : null}
        </div>
        {error ? <div className="status error">{error}</div> : null}
        {!loading && visibleSessions.length === 0 ? (
          <div className="status">まだ記録がありません。</div>
        ) : null}
        <div className="history-list">
          {visibleSessions.map((session) => {
            const exerciseGroups: ExerciseGroup[] = groupSetsByExercise(
              session.workout_sets ?? []
            );
            const totalSets = exerciseGroups.reduce(
              (sum, group) => sum + group.sets.length,
              0
            );
            const aiReportStatus = getAiReportStatus(session);

            return (
              <article key={session.id} className="history-card">
              <div className="row">
                <div>
                  <h3>{session.title || "今日のトレーニング"}</h3>
                  <p className="muted">
                    {exerciseGroups.length}種目 / {totalSets}セット
                  </p>
                </div>
                <span className="muted">{session.session_date}</span>
              </div>

              <span className={`status-badge ai-status-${aiReportStatus}`}>
                {getAiReportStatusLabel(aiReportStatus)}
              </span>

              <div className="history-exercise-list">
                {exerciseGroups.map((group) => (
                  <div className="history-exercise-block" key={group.exerciseName}>
                    <div className="row">
                      <h3>{group.exerciseName}</h3>
                      <Link
                        className="button ghost"
                        href={`/workouts/new?sessionId=${session.id}&focusExercise=${encodeURIComponent(group.exerciseName)}`}
                      >
                        編集
                      </Link>
                    </div>
                    <div className="stack">
                      {group.sets.map((set, index) => (
                        <p key={`${group.exerciseName}-${index}`}>
                          {Number(set.weight)}kg × {set.reps}
                        </p>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              <div className="history-actions">
                <Link className="button secondary" href={`/reports/${session.id}`}>
                  {getAiReportActionLabel(aiReportStatus)}
                </Link>
                <Link className="button ghost" href={`/workouts/new?sessionId=${session.id}`}>
                  セッション全体を編集
                </Link>
              </div>
            </article>
            );
          })}
        </div>
      </section>

      {aiQuota.plan !== "pro" ? (
        <section className="panel">
          <p className="eyebrow">Pro</p>
          <h2>AI診断を月30回まで</h2>
          <p className="muted">
            詳細AI診断v2、種目別診断、次回メニュー提案をWeb/PWA版のProで利用できます。
          </p>
          <Link className="button full" href="/pricing">
            Proを見る
          </Link>
        </section>
      ) : null}
    </div>
  );
}
