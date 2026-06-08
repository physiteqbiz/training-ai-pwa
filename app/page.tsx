"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

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

export default function HomePage() {
  const router = useRouter();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [email, setEmail] = useState("");
  const [sessions, setSessions] = useState<WorkoutSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

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

      const { data, error: sessionsError } = await supabase
        .from("workout_sessions")
        .select(
          "id, session_date, title, created_at, ai_report_status, workout_sets(exercise_name, weight, reps, set_order, exercise_order), ai_reports(id, created_at)"
        )
        .order("session_date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(8);

      if (!active) {
        return;
      }

      if (sessionsError) {
        setError(sessionsError.message);
      } else {
        setSessions((data ?? []) as WorkoutSession[]);
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

      <section className="panel">
        <p className="eyebrow">Pro</p>
        <h2>Pro機能は準備中</h2>
        <p className="muted">
          詳細分析、長期グラフ、メニュー自動調整を今後追加予定です。Stripeは未実装です。
        </p>
      </section>
    </div>
  );
}
