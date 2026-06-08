"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

type TrainingExperience = "" | "beginner" | "intermediate" | "advanced";
type Goal =
  | ""
  | "fat_loss"
  | "hypertrophy"
  | "strength"
  | "body_make"
  | "health"
  | "contest"
  | "maintenance";
type MeasurementDevice = "" | "inbody" | "tanita" | "other" | "unknown";

const trainingExperienceOptions: Array<{ value: TrainingExperience; label: string }> = [
  { value: "", label: "未入力" },
  { value: "beginner", label: "初心者" },
  { value: "intermediate", label: "中級者" },
  { value: "advanced", label: "上級者" }
];

const goalOptions: Array<{ value: Goal; label: string }> = [
  { value: "", label: "未入力" },
  { value: "fat_loss", label: "ダイエット" },
  { value: "hypertrophy", label: "筋肥大" },
  { value: "strength", label: "筋力アップ" },
  { value: "body_make", label: "ボディメイク" },
  { value: "health", label: "健康維持" },
  { value: "contest", label: "競技・大会" },
  { value: "maintenance", label: "維持" }
];

const measurementDeviceOptions: Array<{ value: MeasurementDevice; label: string }> = [
  { value: "", label: "未入力" },
  { value: "inbody", label: "InBody" },
  { value: "tanita", label: "TANITA" },
  { value: "other", label: "その他" },
  { value: "unknown", label: "不明" }
];

function todayString() {
  return new Date().toISOString().slice(0, 10);
}

function nullableText(value: string) {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function nullableNumber(value: string) {
  if (!value.trim()) {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export default function SettingsPage() {
  const router = useRouter();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [userId, setUserId] = useState("");
  const [email, setEmail] = useState("");
  const [heightCm, setHeightCm] = useState("");
  const [trainingExperience, setTrainingExperience] = useState<TrainingExperience>("");
  const [primaryGoal, setPrimaryGoal] = useState<Goal>("");
  const [secondaryGoal, setSecondaryGoal] = useState<Goal>("");
  const [bodyMeasurementId, setBodyMeasurementId] = useState("");
  const [measuredAt, setMeasuredAt] = useState(todayString());
  const [weightKg, setWeightKg] = useState("");
  const [bodyFatPercent, setBodyFatPercent] = useState("");
  const [skeletalMuscleMassKg, setSkeletalMuscleMassKg] = useState("");
  const [skeletalMuscleRatePercent, setSkeletalMuscleRatePercent] = useState("");
  const [muscleMassKg, setMuscleMassKg] = useState("");
  const [measurementDevice, setMeasurementDevice] = useState<MeasurementDevice>("");
  const [measurementMemo, setMeasurementMemo] = useState("");
  const [loading, setLoading] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingMeasurement, setSavingMeasurement] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    async function load() {
      setError("");
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

      setUserId(user.id);
      setEmail(user.email ?? "");

      const [profileResult, measurementResult] = await Promise.all([
        supabase
          .from("user_fitness_profiles")
          .select("height_cm, training_experience, primary_goal, secondary_goal")
          .eq("user_id", user.id)
          .maybeSingle(),
        supabase
          .from("body_measurements")
          .select(
            "id, measured_at, weight_kg, body_fat_percent, skeletal_muscle_mass_kg, skeletal_muscle_rate_percent, muscle_mass_kg, measurement_device, memo"
          )
          .eq("user_id", user.id)
          .order("measured_at", { ascending: false })
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle()
      ]);

      if (!active) {
        return;
      }

      if (profileResult.error) {
        setError(profileResult.error.message);
      } else if (profileResult.data) {
        setHeightCm(
          profileResult.data.height_cm == null ? "" : String(Number(profileResult.data.height_cm))
        );
        setTrainingExperience(
          (profileResult.data.training_experience ?? "") as TrainingExperience
        );
        setPrimaryGoal((profileResult.data.primary_goal ?? "") as Goal);
        setSecondaryGoal((profileResult.data.secondary_goal ?? "") as Goal);
      }

      if (measurementResult.error) {
        setError(measurementResult.error.message);
      } else if (measurementResult.data) {
        const measurement = measurementResult.data;
        setBodyMeasurementId(measurement.id ?? "");
        setMeasuredAt(measurement.measured_at ?? todayString());
        setWeightKg(measurement.weight_kg == null ? "" : String(Number(measurement.weight_kg)));
        setBodyFatPercent(
          measurement.body_fat_percent == null ? "" : String(Number(measurement.body_fat_percent))
        );
        setSkeletalMuscleMassKg(
          measurement.skeletal_muscle_mass_kg == null
            ? ""
            : String(Number(measurement.skeletal_muscle_mass_kg))
        );
        setSkeletalMuscleRatePercent(
          measurement.skeletal_muscle_rate_percent == null
            ? ""
            : String(Number(measurement.skeletal_muscle_rate_percent))
        );
        setMuscleMassKg(
          measurement.muscle_mass_kg == null ? "" : String(Number(measurement.muscle_mass_kg))
        );
        setMeasurementDevice((measurement.measurement_device ?? "") as MeasurementDevice);
        setMeasurementMemo(measurement.memo ?? "");
      }
    }

    void load();

    return () => {
      active = false;
    };
  }, [router, supabase]);

  async function saveFitnessProfile() {
    if (!userId) {
      setError("ログイン状態を確認できませんでした。");
      return;
    }

    setSavingProfile(true);
    setMessage("");
    setError("");

    const { error: saveError } = await supabase
      .from("user_fitness_profiles")
      .upsert(
        {
          user_id: userId,
          height_cm: nullableNumber(heightCm),
          training_experience: nullableText(trainingExperience),
          primary_goal: nullableText(primaryGoal),
          secondary_goal: nullableText(secondaryGoal)
        },
        { onConflict: "user_id" }
      );

    if (saveError) {
      setError(saveError.message);
    } else {
      setMessage("ユーザー特性を保存しました。");
    }

    setSavingProfile(false);
  }

  async function saveBodyMeasurement() {
    if (!userId) {
      setError("ログイン状態を確認できませんでした。");
      return;
    }

    setSavingMeasurement(true);
    setMessage("");
    setError("");

    const payload = {
      user_id: userId,
      measured_at: measuredAt || todayString(),
      weight_kg: nullableNumber(weightKg),
      body_fat_percent: nullableNumber(bodyFatPercent),
      skeletal_muscle_mass_kg: nullableNumber(skeletalMuscleMassKg),
      skeletal_muscle_rate_percent: nullableNumber(skeletalMuscleRatePercent),
      muscle_mass_kg: nullableNumber(muscleMassKg),
      measurement_device: nullableText(measurementDevice),
      memo: nullableText(measurementMemo)
    };

    const result = bodyMeasurementId
      ? await supabase
          .from("body_measurements")
          .update(payload)
          .eq("id", bodyMeasurementId)
          .select("id")
          .single()
      : await supabase.from("body_measurements").insert(payload).select("id").single();

    if (result.error || !result.data) {
      setError(result.error?.message ?? "体組成の保存に失敗しました。");
    } else {
      setBodyMeasurementId(result.data.id);
      setMessage("最新の体組成を保存しました。");
    }

    setSavingMeasurement(false);
  }

  async function logout() {
    setLoading(true);
    await supabase.auth.signOut();
    router.replace("/login");
  }

  return (
    <div className="screen">
      <header className="screen-header">
        <p className="eyebrow">Settings</p>
        <h1>設定</h1>
      </header>

      {message ? <div className="status success">{message}</div> : null}
      {error ? <div className="status error">{error}</div> : null}

      <section className="panel">
        <div className="stack">
          <h2>ユーザー特性</h2>
          <p className="muted">分かる範囲だけ入力してください。未入力でもAI診断は利用できます。</p>
        </div>
        <label className="field">
          <span>身長 cm（任意）</span>
          <input
            className="input"
            inputMode="decimal"
            min="0"
            step="0.1"
            type="number"
            value={heightCm}
            onChange={(event) => setHeightCm(event.target.value)}
          />
        </label>
        <label className="field">
          <span>トレーニング経験（任意）</span>
          <select
            className="input"
            value={trainingExperience}
            onChange={(event) => setTrainingExperience(event.target.value as TrainingExperience)}
          >
            {trainingExperienceOptions.map((option) => (
              <option key={option.value || "empty"} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>主目的（任意）</span>
          <select
            className="input"
            value={primaryGoal}
            onChange={(event) => setPrimaryGoal(event.target.value as Goal)}
          >
            {goalOptions.map((option) => (
              <option key={option.value || "empty"} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>副目的（任意）</span>
          <select
            className="input"
            value={secondaryGoal}
            onChange={(event) => setSecondaryGoal(event.target.value as Goal)}
          >
            {goalOptions.map((option) => (
              <option key={option.value || "empty"} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <button
          className="button full"
          disabled={savingProfile}
          type="button"
          onClick={() => void saveFitnessProfile()}
        >
          {savingProfile ? "保存中" : "ユーザー特性を保存"}
        </button>
      </section>

      <section className="panel">
        <div className="stack">
          <h2>最新の体組成</h2>
          <p className="muted">
            測定機器によって骨格筋量・筋肉量の定義が異なるため、分かる項目だけで問題ありません。
          </p>
        </div>
        <label className="field">
          <span>測定日（任意）</span>
          <input
            className="input"
            type="date"
            value={measuredAt}
            onChange={(event) => setMeasuredAt(event.target.value)}
          />
        </label>
        <label className="field">
          <span>体重 kg（任意）</span>
          <input
            className="input"
            inputMode="decimal"
            min="0"
            step="0.1"
            type="number"
            value={weightKg}
            onChange={(event) => setWeightKg(event.target.value)}
          />
        </label>
        <label className="field">
          <span>体脂肪率 %（任意）</span>
          <input
            className="input"
            inputMode="decimal"
            min="0"
            step="0.1"
            type="number"
            value={bodyFatPercent}
            onChange={(event) => setBodyFatPercent(event.target.value)}
          />
        </label>
        <label className="field">
          <span>骨格筋量 kg（任意）</span>
          <input
            className="input"
            inputMode="decimal"
            min="0"
            step="0.1"
            type="number"
            value={skeletalMuscleMassKg}
            onChange={(event) => setSkeletalMuscleMassKg(event.target.value)}
          />
        </label>
        <label className="field">
          <span>骨格筋率 %（任意）</span>
          <input
            className="input"
            inputMode="decimal"
            min="0"
            step="0.1"
            type="number"
            value={skeletalMuscleRatePercent}
            onChange={(event) => setSkeletalMuscleRatePercent(event.target.value)}
          />
        </label>
        <label className="field">
          <span>筋肉量 kg（任意）</span>
          <input
            className="input"
            inputMode="decimal"
            min="0"
            step="0.1"
            type="number"
            value={muscleMassKg}
            onChange={(event) => setMuscleMassKg(event.target.value)}
          />
        </label>
        <label className="field">
          <span>測定機器（任意）</span>
          <select
            className="input"
            value={measurementDevice}
            onChange={(event) => setMeasurementDevice(event.target.value as MeasurementDevice)}
          >
            {measurementDeviceOptions.map((option) => (
              <option key={option.value || "empty"} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>メモ（任意）</span>
          <textarea
            className="input textarea"
            value={measurementMemo}
            onChange={(event) => setMeasurementMemo(event.target.value)}
          />
        </label>
        <button
          className="button full"
          disabled={savingMeasurement}
          type="button"
          onClick={() => void saveBodyMeasurement()}
        >
          {savingMeasurement ? "保存中" : "最新の体組成を保存"}
        </button>
      </section>

      <section className="panel">
        <div className="field">
          <span>ログイン中のメールアドレス</span>
          <p>{email || "確認中"}</p>
        </div>
        <button className="button danger full" disabled={loading} type="button" onClick={logout}>
          ログアウト
        </button>
      </section>
    </div>
  );
}
