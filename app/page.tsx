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
};

type WorkoutSession = {
  id: string;
  session_date: string;
  title: string | null;
  created_at: string;
  workout_sets: WorkoutSet[];
  ai_reports: { id: string; created_at: string }[];
};

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
          "id, session_date, title, created_at, workout_sets(exercise_name, weight, reps, set_order), ai_reports(id, created_at)"
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

  const latestReportSession = sessions.find((session) => session.ai_reports?.length);

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
        {!loading && sessions.length === 0 ? (
          <div className="status">まだ記録がありません。</div>
        ) : null}
        <div className="history-list">
          {sessions.map((session) => (
            <Link
              key={session.id}
              className="history-card"
              href={`/reports/${session.id}`}
            >
              <div className="row">
                <h3>{session.title || "トレーニング"}</h3>
                <span className="muted">{session.session_date}</span>
              </div>
              <div className="history-card__sets">
                {session.workout_sets
                  ?.slice()
                  .sort((a, b) => a.set_order - b.set_order)
                  .slice(0, 5)
                  .map((set, index) => (
                    <span className="pill" key={`${set.exercise_name}-${index}`}>
                      {set.exercise_name} {Number(set.weight)}kg x {set.reps}
                    </span>
                  ))}
              </div>
              <p className="muted">
                {session.ai_reports?.length ? "AI診断あり" : "AI診断未生成"}
              </p>
            </Link>
          ))}
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
