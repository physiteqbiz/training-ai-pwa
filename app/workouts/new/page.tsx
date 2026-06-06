"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

type SetInput = {
  weight: string;
  reps: string;
};

type PreviousSet = {
  id: string;
  exercise_name: string;
  weight: number | string;
  reps: number;
  set_order: number;
  created_at: string;
  workout_sessions: { session_date: string } | { session_date: string }[] | null;
};

function todayString() {
  return new Date().toISOString().slice(0, 10);
}

export default function NewWorkoutPage() {
  const router = useRouter();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [sessionDate, setSessionDate] = useState(todayString());
  const [exerciseName, setExerciseName] = useState("ベンチプレス");
  const [sets, setSets] = useState<SetInput[]>([{ weight: "100", reps: "8" }]);
  const [previousSets, setPreviousSets] = useState<PreviousSet[]>([]);
  const [userId, setUserId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    async function loadUser() {
      const {
        data: { user }
      } = await supabase.auth.getUser();

      if (!user) {
        router.replace("/login");
        return;
      }

      if (active) {
        setUserId(user.id);
      }
    }

    void loadUser();

    return () => {
      active = false;
    };
  }, [router, supabase]);

  useEffect(() => {
    const name = exerciseName.trim();
    if (!name) {
      setPreviousSets([]);
      return;
    }

    let active = true;
    const timer = window.setTimeout(async () => {
      const { data } = await supabase
        .from("workout_sets")
        .select(
          "id, exercise_name, weight, reps, set_order, created_at, workout_sessions!inner(session_date)"
        )
        .eq("exercise_name", name)
        .order("created_at", { ascending: false })
        .limit(8);

      if (active) {
        setPreviousSets((data ?? []) as PreviousSet[]);
      }
    }, 250);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [exerciseName, supabase]);

  function updateSet(index: number, patch: Partial<SetInput>) {
    setSets((current) =>
      current.map((set, setIndex) => (setIndex === index ? { ...set, ...patch } : set))
    );
  }

  function adjustWeight(index: number, delta: number) {
    const value = Number(sets[index]?.weight || 0);
    updateSet(index, { weight: String(Math.max(0, value + delta)) });
  }

  function adjustReps(index: number, delta: number) {
    const value = Number(sets[index]?.reps || 0);
    updateSet(index, { reps: String(Math.max(1, value + delta)) });
  }

  function addSet() {
    const last = sets[sets.length - 1] ?? { weight: "", reps: "" };
    setSets((current) => [...current, { ...last }]);
  }

  function removeSet(index: number) {
    setSets((current) => current.filter((_, setIndex) => setIndex !== index));
  }

  async function saveSession() {
    const cleanExerciseName = exerciseName.trim();
    const validSets = sets
      .map((set, index) => ({
        weight: Number(set.weight),
        reps: Number(set.reps),
        set_order: index + 1
      }))
      .filter((set) => cleanExerciseName && set.weight >= 0 && set.reps > 0);

    if (!userId || !cleanExerciseName || validSets.length === 0) {
      setError("種目、重量、回数を入力してください。");
      return;
    }

    setLoading(true);
    setError("");

    const { data: session, error: sessionError } = await supabase
      .from("workout_sessions")
      .insert({
        user_id: userId,
        session_date: sessionDate,
        title: cleanExerciseName
      })
      .select("id")
      .single();

    if (sessionError || !session) {
      setError(sessionError?.message ?? "セッション保存に失敗しました。");
      setLoading(false);
      return;
    }

    const { error: setsError } = await supabase.from("workout_sets").insert(
      validSets.map((set) => ({
        session_id: session.id,
        user_id: userId,
        exercise_name: cleanExerciseName,
        weight: set.weight,
        reps: set.reps,
        set_order: set.set_order
      }))
    );

    if (setsError) {
      setError(setsError.message);
      setLoading(false);
      return;
    }

    router.push(`/reports/${session.id}`);
  }

  return (
    <div className="screen">
      <header className="screen-header">
        <p className="eyebrow">Workout</p>
        <h1>トレーニング入力</h1>
      </header>

      <section className="panel">
        <label className="field">
          <span>セッション日付</span>
          <input
            className="input"
            type="date"
            value={sessionDate}
            onChange={(event) => setSessionDate(event.target.value)}
          />
        </label>
        <label className="field">
          <span>種目名</span>
          <input
            className="input"
            autoComplete="off"
            value={exerciseName}
            onChange={(event) => setExerciseName(event.target.value)}
          />
        </label>
      </section>

      {previousSets.length ? (
        <section className="panel">
          <h2>前回同種目ログ</h2>
          <div className="history-card__sets">
            {previousSets.slice(0, 6).map((set) => {
              const session = Array.isArray(set.workout_sessions)
                ? set.workout_sessions[0]
                : set.workout_sessions;

              return (
                <span className="pill" key={set.id}>
                  {session?.session_date ?? ""} {Number(set.weight)}kg x {set.reps}
                </span>
              );
            })}
          </div>
        </section>
      ) : null}

      <section className="stack">
        {sets.map((set, index) => (
          <div className="set-card" key={index}>
            <div className="row">
              <h2>セット {index + 1}</h2>
              {sets.length > 1 ? (
                <button
                  className="button ghost danger"
                  type="button"
                  onClick={() => removeSet(index)}
                >
                  削除
                </button>
              ) : null}
            </div>
            <div className="set-grid">
              <label className="field">
                <span>重量kg</span>
                <input
                  className="input"
                  inputMode="decimal"
                  type="number"
                  min="0"
                  step="0.5"
                  value={set.weight}
                  onChange={(event) => updateSet(index, { weight: event.target.value })}
                />
              </label>
              <label className="field">
                <span>回数</span>
                <input
                  className="input"
                  inputMode="numeric"
                  type="number"
                  min="1"
                  step="1"
                  value={set.reps}
                  onChange={(event) => updateSet(index, { reps: event.target.value })}
                />
              </label>
            </div>
            <div className="quick-grid">
              <button className="button secondary" type="button" onClick={() => adjustWeight(index, -2.5)}>
                -2.5
              </button>
              <button className="button secondary" type="button" onClick={() => adjustWeight(index, 2.5)}>
                +2.5
              </button>
              <button className="button secondary" type="button" onClick={() => adjustReps(index, -1)}>
                -1
              </button>
              <button className="button secondary" type="button" onClick={() => adjustReps(index, 1)}>
                +1
              </button>
            </div>
          </div>
        ))}
      </section>

      <button className="button secondary full" type="button" onClick={addSet}>
        セット追加
      </button>
      <button className="button full" type="button" disabled={loading} onClick={saveSession}>
        セッション保存
      </button>

      {error ? <div className="status error">{error}</div> : null}
    </div>
  );
}
