import { NextResponse } from "next/server";
import OpenAI from "openai";

import {
  ensureBillingProfile,
  ensureCurrentAiQuota,
  recordAiReportUsage,
  summarizeSupabaseError
} from "@/lib/ai-usage";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireEnv } from "@/lib/env";

export const runtime = "nodejs";

type ReportPayload = {
  overall_score?: number;
  overall_label?: string;
  summary: string;
  progress_highlight?: string;
  comparison: string;
  exercise_diagnostics?: ExerciseDiagnostic[];
  goal_based_advice?: string;
  priority_focus?: string;
  good_points: string;
  cautions: string;
  next_workout: string;
};

type SuggestedSet = {
  weight: number;
  reps: number;
  sets: number;
  note: string;
};

type ExerciseDiagnostic = {
  exercise_name: string;
  label: string;
  analysis: string;
  previous_comparison: string;
  next_target: string;
  suggested_sets: SuggestedSet[];
};

type WorkoutSetRow = {
  session_id?: string;
  exercise_name: string;
  weight: number | string;
  reps: number;
  set_order: number;
  exercise_order?: number;
  created_at?: string;
  workout_sessions?:
    | { id?: string; session_date: string; created_at?: string }
    | { id?: string; session_date: string; created_at?: string }[]
    | null;
};

type PreviousWorkoutSession = {
  id: string;
  session_date: string;
  created_at: string;
  workout_sets: WorkoutSetRow[];
};

type NormalizedSet = {
  exercise_name: string;
  weight: number;
  reps: number;
  set_order: number;
  exercise_order: number;
};

type ExerciseAnalysis = {
  exercise_name: string;
  set_count: number;
  total_reps: number;
  total_volume: number;
  max_weight: number;
  best_set: {
    weight: number;
    reps: number;
    estimated_1rm: number;
  };
  sets: Array<{
    weight: number;
    reps: number;
    set_order: number;
  }>;
  max_weight_bodyweight_ratio?: number;
  estimated_1rm_bodyweight_ratio?: number;
};

type PreviousExerciseAnalysis = {
  previous_sessions: Array<
    ExerciseAnalysis & {
      session_id: string;
      session_date: string;
    }
  >;
  previous_best_set: ExerciseAnalysis["best_set"] | null;
  previous_estimated_1rm: number | null;
  previous_total_volume: number | null;
  previous_total_sets: number | null;
  previous_total_reps: number | null;
  trend_last_3_sessions: "improving" | "stable" | "declining" | "insufficient_data";
};

type UserFitnessProfile = {
  height_cm: number | string | null;
  training_experience: string | null;
  primary_goal: string | null;
  secondary_goal: string | null;
};

type BodyMeasurement = {
  measured_at: string;
  weight_kg: number | string | null;
  body_fat_percent: number | string | null;
  skeletal_muscle_mass_kg: number | string | null;
  skeletal_muscle_rate_percent: number | string | null;
  muscle_mass_kg: number | string | null;
  measurement_device: string | null;
  memo: string | null;
};

const trainingExperienceLabels: Record<string, string> = {
  beginner: "初心者",
  intermediate: "中級者",
  advanced: "上級者"
};

const goalLabels: Record<string, string> = {
  fat_loss: "ダイエット",
  hypertrophy: "筋肥大",
  strength: "筋力アップ",
  body_make: "ボディメイク",
  health: "健康維持",
  contest: "競技・大会",
  maintenance: "維持"
};

const measurementDeviceLabels: Record<string, string> = {
  inbody: "InBody",
  tanita: "TANITA",
  other: "その他",
  unknown: "不明"
};

function normalizeReport(value: unknown): ReportPayload {
  const record = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const rawDiagnostics = Array.isArray(record.exercise_diagnostics)
    ? record.exercise_diagnostics
    : [];
  const exerciseDiagnostics = rawDiagnostics.map((item) => {
    const diagnostic =
      item && typeof item === "object" ? (item as Record<string, unknown>) : {};
    const rawSuggestedSets = Array.isArray(diagnostic.suggested_sets)
      ? diagnostic.suggested_sets
      : [];

    return {
      exercise_name: String(diagnostic.exercise_name ?? ""),
      label: String(diagnostic.label ?? ""),
      analysis: String(diagnostic.analysis ?? ""),
      previous_comparison: String(diagnostic.previous_comparison ?? ""),
      next_target: String(diagnostic.next_target ?? ""),
      suggested_sets: rawSuggestedSets.map((set) => {
        const suggestedSet =
          set && typeof set === "object" ? (set as Record<string, unknown>) : {};

        return {
          weight: Number(suggestedSet.weight ?? 0),
          reps: Number(suggestedSet.reps ?? 0),
          sets: Number(suggestedSet.sets ?? 0),
          note: String(suggestedSet.note ?? "")
        };
      })
    };
  });
  const progressHighlight = String(record.progress_highlight ?? record.good_points ?? "");

  return {
    overall_score:
      record.overall_score === undefined || record.overall_score === null
        ? undefined
        : Number(record.overall_score),
    overall_label:
      record.overall_label === undefined || record.overall_label === null
        ? undefined
        : String(record.overall_label),
    summary: String(record.summary ?? ""),
    progress_highlight: progressHighlight,
    comparison: String(record.comparison ?? ""),
    exercise_diagnostics: exerciseDiagnostics.filter((item) => item.exercise_name),
    goal_based_advice:
      record.goal_based_advice === undefined || record.goal_based_advice === null
        ? undefined
        : String(record.goal_based_advice),
    priority_focus:
      record.priority_focus === undefined || record.priority_focus === null
        ? undefined
        : String(record.priority_focus),
    good_points: progressHighlight,
    cautions: String(record.cautions ?? ""),
    next_workout: String(record.next_workout ?? "")
  };
}

function parseJsonReport(content: string): ReportPayload {
  try {
    return normalizeReport(JSON.parse(content));
  } catch {
    const match = content.match(/\{[\s\S]*\}/);
    if (!match) {
      console.error("ai report json parse error", "OpenAI response did not include JSON.");
      throw new Error("AI診断結果をJSONとして読めませんでした。");
    }

    try {
      return normalizeReport(JSON.parse(match[0]));
    } catch (error) {
      console.error(
        "ai report json parse error",
        error instanceof Error ? error.message : "Unknown parse error."
      );
      throw new Error("AI診断結果のJSON形式が正しくありませんでした。");
    }
  }
}

function roundOne(value: number) {
  return Math.round(value * 10) / 10;
}

function estimateOneRepMax(weight: number, reps: number) {
  return roundOne(weight * (1 + reps / 30));
}

function normalizeSet(set: WorkoutSetRow): NormalizedSet {
  return {
    exercise_name: set.exercise_name,
    weight: Number(set.weight),
    reps: Number(set.reps),
    set_order: Number(set.set_order),
    exercise_order: Number(set.exercise_order ?? 0)
  };
}

function summarizeExercise(
  exerciseName: string,
  sets: NormalizedSet[],
  bodyWeightKg?: number
): ExerciseAnalysis {
  const sortedSets = sets.slice().sort((a, b) => a.set_order - b.set_order);
  const totalReps = sortedSets.reduce((sum, set) => sum + set.reps, 0);
  const totalVolume = sortedSets.reduce((sum, set) => sum + set.weight * set.reps, 0);
  const bestSet = sortedSets
    .map((set) => ({
      weight: set.weight,
      reps: set.reps,
      estimated_1rm: estimateOneRepMax(set.weight, set.reps)
    }))
    .sort((a, b) => b.estimated_1rm - a.estimated_1rm || b.weight - a.weight)[0] ?? {
      weight: 0,
      reps: 0,
      estimated_1rm: 0
    };
  const maxWeight = sortedSets.reduce((max, set) => Math.max(max, set.weight), 0);
  const analysis: ExerciseAnalysis = {
    exercise_name: exerciseName,
    set_count: sortedSets.length,
    total_reps: totalReps,
    total_volume: roundOne(totalVolume),
    max_weight: maxWeight,
    best_set: bestSet,
    sets: sortedSets.map((set) => ({
      weight: set.weight,
      reps: set.reps,
      set_order: set.set_order
    }))
  };

  if (bodyWeightKg && bodyWeightKg > 0) {
    analysis.max_weight_bodyweight_ratio = roundOne(maxWeight / bodyWeightKg);
    analysis.estimated_1rm_bodyweight_ratio = roundOne(bestSet.estimated_1rm / bodyWeightKg);
  }

  return analysis;
}

function buildCurrentAnalysis(sets: NormalizedSet[], bodyWeightKg?: number) {
  const grouped = new Map<string, NormalizedSet[]>();

  for (const set of sets) {
    const current = grouped.get(set.exercise_name) ?? [];
    current.push(set);
    grouped.set(set.exercise_name, current);
  }

  const exercisesSummary = Array.from(grouped.entries())
    .map(([exerciseName, exerciseSets]) => summarizeExercise(exerciseName, exerciseSets, bodyWeightKg))
    .sort((a, b) => {
      const aOrder = sets.find((set) => set.exercise_name === a.exercise_name)?.exercise_order ?? 0;
      const bOrder = sets.find((set) => set.exercise_name === b.exercise_name)?.exercise_order ?? 0;
      return aOrder - bOrder;
    });
  const totalSets = sets.length;
  const totalReps = sets.reduce((sum, set) => sum + set.reps, 0);
  const totalVolume = sets.reduce((sum, set) => sum + set.weight * set.reps, 0);

  return {
    exercise_count: exercisesSummary.length,
    total_sets: totalSets,
    total_reps: totalReps,
    total_volume: roundOne(totalVolume),
    main_exercises: exercisesSummary.slice(0, 1).map((exercise) => exercise.exercise_name),
    accessory_exercises: exercisesSummary.slice(1).map((exercise) => exercise.exercise_name),
    exercises_summary: exercisesSummary
  };
}

function compareTrend(sessions: Array<ExerciseAnalysis & { session_id: string; session_date: string }>) {
  if (sessions.length < 2) {
    return "insufficient_data" as const;
  }

  const latest = sessions[0]?.best_set.estimated_1rm ?? 0;
  const oldest = sessions[Math.min(sessions.length, 3) - 1]?.best_set.estimated_1rm ?? latest;
  const threshold = Math.max(1, oldest * 0.01);

  if (latest > oldest + threshold) {
    return "improving" as const;
  }

  if (latest < oldest - threshold) {
    return "declining" as const;
  }

  return "stable" as const;
}

function pickLatestVisibleSessionsByDate(
  sessions: PreviousWorkoutSession[],
  currentSessionId: string,
  currentSessionDate: string
) {
  const latestByDate = new Map<string, PreviousWorkoutSession>();

  for (const session of sessions
    .filter(
      (candidate) =>
        candidate.id !== currentSessionId &&
        candidate.session_date < currentSessionDate
    )
    .sort(
      (a, b) =>
        b.session_date.localeCompare(a.session_date) ||
        b.created_at.localeCompare(a.created_at)
    )) {
    if (!latestByDate.has(session.session_date)) {
      latestByDate.set(session.session_date, session);
    }
  }

  return Array.from(latestByDate.values());
}

function buildPreviousAnalysisFromSessions(
  previousSessions: PreviousWorkoutSession[],
  exerciseNames: string[],
  bodyWeightKg?: number
) {
  const result: Record<string, PreviousExerciseAnalysis> = {};

  for (const exerciseName of exerciseNames) {
    const sessions = previousSessions
      .map((session) => ({
        session_id: session.id,
        session_date: session.session_date,
        sets: (session.workout_sets ?? [])
          .filter((set) => set.exercise_name === exerciseName)
          .map((set) => normalizeSet({ ...set, session_id: session.id }))
      }))
      .filter((session) => session.sets.length > 0)
      .slice(0, 3)
      .map((session) => ({
        session_id: session.session_id,
        session_date: session.session_date,
        ...summarizeExercise(exerciseName, session.sets, bodyWeightKg)
      }));
    const latest = sessions[0];

    result[exerciseName] = {
      previous_sessions: sessions,
      previous_best_set: latest?.best_set ?? null,
      previous_estimated_1rm: latest?.best_set.estimated_1rm ?? null,
      previous_total_volume: latest?.total_volume ?? null,
      previous_total_sets: latest?.set_count ?? null,
      previous_total_reps: latest?.total_reps ?? null,
      trend_last_3_sessions: compareTrend(sessions)
    };
  }

  return result;
}

function hasInput(value: unknown) {
  return value !== null && value !== undefined && String(value).trim() !== "";
}

function addNumberIfPresent(
  target: Record<string, unknown>,
  key: string,
  value: number | string | null
) {
  if (hasInput(value)) {
    target[key] = Number(value);
  }
}

function buildUserFitnessContext(
  profile: UserFitnessProfile | null,
  measurement: BodyMeasurement | null
) {
  const profileContext: Record<string, unknown> = {};
  const measurementContext: Record<string, unknown> = {};

  if (profile) {
    addNumberIfPresent(profileContext, "height_cm", profile.height_cm);

    if (hasInput(profile.training_experience)) {
      profileContext.training_experience = {
        value: profile.training_experience,
        label: trainingExperienceLabels[profile.training_experience ?? ""] ?? profile.training_experience
      };
    }

    if (hasInput(profile.primary_goal)) {
      profileContext.primary_goal = {
        value: profile.primary_goal,
        label: goalLabels[profile.primary_goal ?? ""] ?? profile.primary_goal
      };
    }

    if (hasInput(profile.secondary_goal)) {
      profileContext.secondary_goal = {
        value: profile.secondary_goal,
        label: goalLabels[profile.secondary_goal ?? ""] ?? profile.secondary_goal
      };
    }
  }

  if (measurement) {
    if (hasInput(measurement.measured_at)) {
      measurementContext.measured_at = measurement.measured_at;
    }

    addNumberIfPresent(measurementContext, "weight_kg", measurement.weight_kg);
    addNumberIfPresent(measurementContext, "body_fat_percent", measurement.body_fat_percent);
    addNumberIfPresent(
      measurementContext,
      "skeletal_muscle_mass_kg",
      measurement.skeletal_muscle_mass_kg
    );
    addNumberIfPresent(
      measurementContext,
      "skeletal_muscle_rate_percent",
      measurement.skeletal_muscle_rate_percent
    );
    addNumberIfPresent(measurementContext, "muscle_mass_kg", measurement.muscle_mass_kg);

    if (hasInput(measurement.measurement_device)) {
      measurementContext.measurement_device = {
        value: measurement.measurement_device,
        label:
          measurementDeviceLabels[measurement.measurement_device ?? ""] ??
          measurement.measurement_device
      };
    }

    if (hasInput(measurement.memo)) {
      measurementContext.memo = measurement.memo;
    }
  }

  return {
    profile: Object.keys(profileContext).length ? profileContext : null,
    latest_body_measurement: Object.keys(measurementContext).length ? measurementContext : null
  };
}

async function getAuthenticatedUser(request: Request) {
  const admin = createSupabaseAdminClient();
  const authorization = request.headers.get("authorization");
  const token = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];

  if (token) {
    const {
      data: { user },
      error
    } = await admin.auth.getUser(token);

    if (!error && user) {
      return user;
    }
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  return user;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { workout_session_id?: string };
    const sessionId = body.workout_session_id;

    if (!sessionId) {
      return NextResponse.json({ error: "workout_session_id is required." }, { status: 400 });
    }

    const user = await getAuthenticatedUser(request);

    if (!user) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const admin = createSupabaseAdminClient();
    const { data: session, error: sessionError } = await admin
      .from("workout_sessions")
      .select(
        "id, user_id, session_date, title, memo, workout_sets(id, exercise_name, weight, reps, set_order, exercise_order)"
      )
      .eq("id", sessionId)
      .eq("user_id", user.id)
      .single();

    if (sessionError || !session) {
      return NextResponse.json(
        { error: sessionError?.message ?? "Workout session not found." },
        { status: 404 }
      );
    }

    const sets = (session.workout_sets ?? []) as WorkoutSetRow[];

    if (sets.length === 0) {
      return NextResponse.json({ error: "Workout sets are empty." }, { status: 400 });
    }

    const initialBillingProfile = await ensureBillingProfile(admin, user);
    const { profile: billingProfile, usage } = await ensureCurrentAiQuota(
      admin,
      initialBillingProfile
    );

    if (usage.isQuotaExceeded) {
      return NextResponse.json(
        {
          error:
            "今月のAI診断回数を使い切りました。Proにすると月30回まで利用できます。",
          usage
        },
        { status: 429 }
      );
    }

    const normalizedSets = sets.map(normalizeSet);
    const exerciseNames = [...new Set(sets.map((set) => set.exercise_name))];
    const { data: previousSessionsData } = await admin
      .from("workout_sessions")
      .select(
        "id, session_date, created_at, workout_sets(session_id, exercise_name, weight, reps, set_order, exercise_order, created_at)"
      )
      .eq("user_id", user.id)
      .neq("id", sessionId)
      .lt("session_date", session.session_date)
      .order("session_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(120);

    const [{ data: fitnessProfile }, { data: latestBodyMeasurement }] = await Promise.all([
      admin
        .from("user_fitness_profiles")
        .select("height_cm, training_experience, primary_goal, secondary_goal")
        .eq("user_id", user.id)
        .maybeSingle(),
      admin
        .from("body_measurements")
        .select(
          "measured_at, weight_kg, body_fat_percent, skeletal_muscle_mass_kg, skeletal_muscle_rate_percent, muscle_mass_kg, measurement_device, memo"
        )
        .eq("user_id", user.id)
        .order("measured_at", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle()
    ]);
    const userFitnessContext = buildUserFitnessContext(
      (fitnessProfile as UserFitnessProfile | null) ?? null,
      (latestBodyMeasurement as BodyMeasurement | null) ?? null
    );
    const bodyWeightValue = Number(latestBodyMeasurement?.weight_kg ?? 0);
    const bodyWeightKg = Number.isFinite(bodyWeightValue) && bodyWeightValue > 0
      ? bodyWeightValue
      : undefined;
    const currentAnalysis = buildCurrentAnalysis(normalizedSets, bodyWeightKg);
    const visiblePreviousSessions = pickLatestVisibleSessionsByDate(
      ((previousSessionsData ?? []) as PreviousWorkoutSession[]),
      session.id,
      session.session_date
    );
    const previousAnalysis = buildPreviousAnalysisFromSessions(
      visiblePreviousSessions,
      exerciseNames,
      bodyWeightKg
    );
    const previousSessionsUsed = currentAnalysis.exercises_summary.flatMap((exercise) =>
      (previousAnalysis[exercise.exercise_name]?.previous_sessions ?? []).map(
        (previousSession) => ({
          session_id: previousSession.session_id,
          session_date: previousSession.session_date,
          exercise_name: exercise.exercise_name
        })
      )
    );
    const computedAnalysis = {
      version: "ai_report_v2",
      session: {
        session_date: session.session_date,
        title: session.title,
        exercise_count: currentAnalysis.exercise_count,
        total_sets: currentAnalysis.total_sets,
        total_reps: currentAnalysis.total_reps,
        total_volume: currentAnalysis.total_volume,
        main_exercises: currentAnalysis.main_exercises,
        accessory_exercises: currentAnalysis.accessory_exercises
      },
      exercises_summary: currentAnalysis.exercises_summary.map((exercise) => ({
        ...exercise,
        previous: previousAnalysis[exercise.exercise_name] ?? {
          previous_sessions: [],
          previous_best_set: null,
          previous_estimated_1rm: null,
          previous_total_volume: null,
          previous_total_sets: null,
          previous_total_reps: null,
          trend_last_3_sessions: "insufficient_data"
        }
      })),
      previous_sessions_used: previousSessionsUsed
    };

    const openai = new OpenAI({
      apiKey: requireEnv("OPENAI_API_KEY")
    });

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.35,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "あなたは筋トレ記録を分析するコーチです。初心者にも経験者にも通じる短い日本語で、パワーリフティングとボディメイクの両方を意識して診断します。医学的診断は避け、フォーム不安や痛みがある場合は専門家への相談を促します。ユーザー特性は入力済みの項目だけを使い、未入力項目は推測しません。単なる感想ではなく、具体的な重量、回数、セット数を含む実行可能な提案を出します。必ずJSONだけを返してください。"
        },
        {
          role: "user",
          content: JSON.stringify({
            required_json_shape: {
              overall_score: "number",
              overall_label: "string",
              summary: "string",
              progress_highlight: "string",
              comparison: "string",
              exercise_diagnostics: [
                {
                  exercise_name: "string",
                  label: "string",
                  analysis: "string",
                  previous_comparison: "string",
                  next_target: "string",
                  suggested_sets: [
                    {
                      weight: "number",
                      reps: "number",
                      sets: "number",
                      note: "string"
                    }
                  ]
                }
              ],
              goal_based_advice: "string",
              priority_focus: "string",
              cautions: "string",
              next_workout: "string"
            },
            instruction:
              "computed_analysisを最優先で使って、今日のセッション全体、種目別、前回比較、直近3回傾向を診断してください。単なる感想で終わらず、次回の重量・回数・セット数をできるだけ具体的に出してください。各exercise_diagnosticsにはnext_targetとsuggested_setsを必ず入れてください。user_fitness_contextに目的や体組成がある場合だけ考慮してください。体重がある場合だけ体重比を補助的に見てください。体脂肪率がない場合は体脂肪状態や減量状態を断定しないでください。骨格筋量、骨格筋率、筋肉量は同じものとして扱わず、測定機器がある場合も測定差を前提に断定しすぎないでください。目的が未入力の場合は一般的な筋肥大と筋力向上の両面から控えめに診断し、目的を決めつけないでください。安全性を無視した極端な重量提案は避けてください。上級者には曖昧すぎる助言を避け、初心者にはフォーム安定と安全性を重視してください。日本語で、スマホで読みやすく、長すぎない文量にしてください。",
            goal_policy: {
              fat_loss: "筋力維持、疲労管理、ボリューム維持、継続性を重視。減量中と断定しない。",
              hypertrophy: "総ボリューム、レップ数、対象筋への刺激、補助種目バランスを重視。",
              strength: "高重量、漸進性、推定1RM、次回重量提案、メインリフトの再現性を重視。",
              body_make: "部位バランス、見た目づくり、弱点部位への刺激、種目構成を重視。",
              health: "安全性、継続性、過度な負荷回避、関節負担への配慮を重視。",
              contest: "部位バランス、仕上がり、疲労管理、弱点補強を重視。",
              maintenance: "維持、無理のない継続、大きく落とさないことを重視。"
            },
            user_fitness_context: userFitnessContext,
            computed_analysis: computedAnalysis
          })
        }
      ]
    });

    const content = completion.choices[0]?.message?.content ?? "{}";
    const report = parseJsonReport(content);

    if (!report.summary || !report.next_workout || !report.exercise_diagnostics?.length) {
      console.error("ai report v2 validation error", {
        hasSummary: Boolean(report.summary),
        hasNextWorkout: Boolean(report.next_workout),
        exerciseDiagnosticCount: report.exercise_diagnostics?.length ?? 0
      });
      return NextResponse.json(
        { error: "AI診断結果が不完全でした。もう一度生成してください。" },
        { status: 500 }
      );
    }

    const { data: savedReport, error: saveError } = await admin
      .from("ai_reports")
      .upsert(
        {
          session_id: session.id,
          user_id: user.id,
          summary: report.summary,
          comparison: report.comparison,
          good_points: report.good_points,
          cautions: report.cautions,
          next_workout: report.next_workout,
          raw_json: {
            version: "ai_report_v2",
            model: "gpt-4o-mini",
            response: report,
            computed_analysis: computedAnalysis,
            previous_sessions_used: previousSessionsUsed,
            user_fitness_context: userFitnessContext,
            generated_at: new Date().toISOString()
          }
        },
        { onConflict: "session_id" }
      )
      .select(
        "id, session_id, user_id, summary, comparison, good_points, cautions, next_workout, raw_json"
      )
      .single();

    if (saveError || !savedReport) {
      console.error("ai report save error", {
        userId: user.id,
        sessionId: session.id,
        error: saveError
          ? summarizeSupabaseError(saveError)
          : { message: "AI report save returned no data." }
      });
      return NextResponse.json(
        { error: saveError?.message ?? "Failed to save AI report." },
        { status: 500 }
      );
    }

    const { error: statusError } = await admin
      .from("workout_sessions")
      .update({ ai_report_status: "generated" })
      .eq("id", session.id)
      .eq("user_id", user.id);

    if (statusError) {
      console.error("ai_report_status update error", {
        userId: user.id,
        sessionId: session.id,
        reportId: savedReport.id,
        error: summarizeSupabaseError(statusError)
      });
      return NextResponse.json(
        { error: statusError.message },
        { status: 500 }
      );
    }

    let usageResult;

    try {
      usageResult = await recordAiReportUsage(admin, billingProfile, session.id);
    } catch (usageError) {
      console.log("usage update partial failure", {
        userId: user.id,
        sessionId: session.id,
        reportId: savedReport.id
      });
      console.error("ai usage update failed after report saved", {
        userId: user.id,
        sessionId: session.id,
        reportId: savedReport.id,
        error: summarizeSupabaseError(usageError)
      });

      return NextResponse.json(
        {
          ok: false,
          partial_success: true,
          error: "usage_update_failed",
          message:
            "AI診断は保存されましたが、利用回数の更新に失敗しました。",
          report: savedReport,
          report_saved: true
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      report: savedReport,
      usage: usageResult.usage,
      usage_log_inserted: usageResult.usageLogInserted
    });
  } catch (error) {
    console.error("ai report api error", {
      error: summarizeSupabaseError(error)
    });

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unexpected error." },
      { status: 500 }
    );
  }
}
