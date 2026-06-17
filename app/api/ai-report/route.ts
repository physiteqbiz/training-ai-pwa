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
import { formatWeight } from "@/lib/weight-unit";
import {
  buildCurrentTrainingAnalysis,
  buildGoalTrainingPolicy,
  buildPreviousTrainingAnalysis,
  compareCurrentToPrevious,
  normalizeTrainingSet,
  pickLatestVisibleSessionsByDate as pickLatestVisibleTrainingSessionsByDate,
  type CurrentTrainingAnalysis,
  type PreviousExerciseAnalysis,
  type PreviousSessionForAnalysis,
  type SuggestedTargets
} from "@/lib/training-analysis";

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
  set_type?: string | null;
  is_assisted?: boolean | null;
  set_memo?: string | null;
  created_at?: string;
  workout_sessions?:
    | { id?: string; session_date: string; created_at?: string }
    | { id?: string; session_date: string; created_at?: string }[]
    | null;
};

type UserFitnessProfile = {
  height_cm: number | string | null;
  training_experience: string | null;
  primary_goal: string | null;
  secondary_goal: string | null;
  weight_unit?: string | null;
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
    overall_score: normalizeScoreToHundred(record.overall_score),
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

function hasInput(value: unknown) {
  return value !== null && value !== undefined && String(value).trim() !== "";
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

function getOverallLabel(score: number) {
  if (score >= 95) {
    return "素晴らしい";
  }

  if (score >= 85) {
    return "非常に良好";
  }

  if (score >= 75) {
    return "良好";
  }

  if (score >= 60) {
    return "普通";
  }

  if (score >= 40) {
    return "やや不調";
  }

  return "大きく不調";
}

function hasExceptionalProgress(
  currentAnalysis: CurrentTrainingAnalysis,
  previousAnalysis: Record<string, PreviousExerciseAnalysis>
) {
  return currentAnalysis.exercises_summary.some((exercise) => {
    const previous = previousAnalysis[exercise.exercise_name];
    const currentRm = exercise.estimated_1rm_from_rm_eligible_sets;
    const previousRm = previous?.previous_estimated_1rm;
    const currentVolume = exercise.working_total_volume;
    const previousVolume = previous?.previous_total_volume;
    const rmImprovement =
      currentRm && previousRm ? (currentRm - previousRm) / previousRm : 0;
    const volumeImprovement =
      currentVolume && previousVolume
        ? (currentVolume - previousVolume) / previousVolume
        : 0;

    return (
      rmImprovement >= 0.06 ||
      (rmImprovement >= 0.035 &&
        volumeImprovement >= 0.12 &&
        exercise.repeated_main_performance.label === "consistent")
    );
  });
}

function buildProgressHighlightFallback(currentAnalysis: CurrentTrainingAnalysis) {
  const exercise = currentAnalysis.exercises_summary[0];

  if (!exercise?.top_single || !exercise.main_set) {
    return null;
  }

  const repeated = exercise.repeated_main_performance;
  const repeatedText =
    repeated.set_count >= 2 && repeated.weight !== null
      ? `${formatWeight(repeated.weight, exercise.weight_unit)}×${repeated.max_reps ?? exercise.main_set.reps}回を${repeated.set_count}セット再現`
      : `${formatWeight(exercise.main_set.weight, exercise.weight_unit)}×${exercise.main_set.reps}回をメインセットとして実施`;

  return `${exercise.exercise_name}はトップシングル${formatWeight(exercise.top_single.weight, exercise.weight_unit)}×1回で高重量への適応を確認し、メインセットでは${repeatedText}しました。高重量確認後でもメイン重量帯の出力が落ちていないため、単発の強さと反復性能の両方が安定しています。`;
}

function buildPracticalCaution(currentAnalysis: CurrentTrainingAnalysis) {
  const exercise = currentAnalysis.exercises_summary[0];

  if (!exercise?.main_set) {
    return "次回もフォームが崩れない重量を優先し、後半セットで回数が落ちる場合は重量を下げて再現性を確保してください。";
  }

  if (exercise.top_single) {
    return `${exercise.exercise_name}は${formatWeight(exercise.top_single.weight, exercise.weight_unit)}×1回の後に${formatWeight(exercise.main_set.weight, exercise.weight_unit)}×${exercise.main_set.reps}回を重ねる構成です。腰の反りや押し出しで無理に回数を稼がず、${exercise.main_set.reps}回目で軌道が崩れる場合は${formatWeight(exercise.main_set.weight, exercise.weight_unit)}を据え置くか${formatWeight(Math.max(0, exercise.main_set.weight - 2.5), exercise.weight_unit)}へ落として再現性を優先してください。`;
  }

  return `${exercise.exercise_name}は${formatWeight(exercise.main_set.weight, exercise.weight_unit)}×${exercise.main_set.reps}回が主な評価対象です。後半セットで軌道や反動が大きくなる場合は、同重量の回数更新よりも重量を少し落として安定した反復を優先してください。`;
}

function isGenericCaution(cautions: string) {
  const trimmed = cautions.trim();

  if (!trimmed) {
    return true;
  }

  return (
    trimmed.length <= 80 &&
    /専門家|医師|相談/.test(trimmed) &&
    !/\d/.test(trimmed)
  );
}

function calibrateReport(
  report: ReportPayload,
  currentAnalysis: CurrentTrainingAnalysis,
  previousAnalysis: Record<string, PreviousExerciseAnalysis>
): ReportPayload {
  const rawScore = report.overall_score;
  const exceptional = hasExceptionalProgress(currentAnalysis, previousAnalysis);
  const calibratedScore =
    rawScore === undefined
      ? undefined
      : rawScore >= 91 && !exceptional
        ? 90
        : rawScore >= 98 && exceptional
          ? 97
          : rawScore;
  const progressFallback = buildProgressHighlightFallback(currentAnalysis);
  const progressHighlight =
    progressFallback &&
    !/高重量確認後|反復性能|再現性/.test(report.progress_highlight ?? "")
      ? progressFallback
      : report.progress_highlight;
  const cautions = isGenericCaution(report.cautions)
    ? buildPracticalCaution(currentAnalysis)
    : report.cautions;

  return {
    ...report,
    overall_score: calibratedScore,
    overall_label:
      calibratedScore === undefined
        ? report.overall_label
        : getOverallLabel(calibratedScore),
    progress_highlight: progressHighlight,
    good_points: progressHighlight ?? report.good_points,
    cautions
  };
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

    if (profile.weight_unit === "kg" || profile.weight_unit === "lb") {
      profileContext.weight_unit = profile.weight_unit;
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

function buildExerciseQualityContext(
  currentAnalysis: CurrentTrainingAnalysis,
  previousAnalysis: Record<string, PreviousExerciseAnalysis>
) {
  return currentAnalysis.exercises_summary.map((exercise) => {
    const previous = previousAnalysis[exercise.exercise_name];

    return {
      exercise_name: exercise.exercise_name,
      top_single: exercise.top_single,
      main_set: exercise.main_set,
      repeated_main_performance: exercise.repeated_main_performance,
      estimated_1rm: exercise.estimated_1rm_from_rm_eligible_sets,
      working_total_volume: exercise.working_total_volume,
      previous_main_set: previous?.previous_main_set ?? null,
      previous_repeated_main_performance:
        previous?.previous_repeated_main_performance ?? null,
      previous_estimated_1rm: previous?.previous_estimated_1rm ?? null,
      previous_total_volume: previous?.previous_total_volume ?? null,
      previous_sessions_count: previous?.previous_sessions.length ?? 0
    };
  });
}

function buildNextMenuStructure(suggestedTargets: Record<string, SuggestedTargets>) {
  const toStep = (
    target: SuggestedTargets["strength_target"][number],
    order: number,
    role: string
  ) => ({
    order,
    role,
    text: target.text,
    weight_kg: target.weight_kg,
    display_weight: target.display_weight,
    display_unit: target.display_unit,
    reps: target.reps,
    sets: target.sets,
    candidate_e1rm: target.candidate_e1rm,
    candidate_e1rm_ratio: target.candidate_e1rm_ratio,
    candidate_e1rm_check: target.candidate_e1rm_check
  });

  return Object.fromEntries(
    Object.entries(suggestedTargets).map(([exerciseName, targets]) => [
      exerciseName,
      {
        priority_target: targets.priority_target,
        strength_sequence: targets.strength_target.map((target, index) =>
          toStep(target, index + 1, index === 0 ? "top_single_or_top_set" : index === 1 ? "main_set" : "backoff")
        ),
        hypertrophy_sequence: targets.hypertrophy_target.map((target, index) =>
          toStep(target, index + 1, index < 2 ? "volume_set" : "backoff")
        ),
        fatigue_management_sequence: targets.fatigue_management_target.map((target, index) =>
          toStep(target, index + 1, index === 0 ? "light_top_check" : "reduced_load")
        )
      }
    ])
  );
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
        "id, user_id, session_date, title, memo, workout_sets(id, exercise_name, weight, reps, set_order, exercise_order, set_type, is_assisted, set_memo)"
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

    const normalizedSets = sets.map(normalizeTrainingSet);
    const exerciseNames = [...new Set(sets.map((set) => set.exercise_name))];
    const { data: previousSessionsData } = await admin
      .from("workout_sessions")
      .select(
        "id, session_date, created_at, workout_sets(session_id, exercise_name, weight, reps, set_order, exercise_order, set_type, is_assisted, set_memo, created_at)"
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
        .select("height_cm, training_experience, primary_goal, secondary_goal, weight_unit")
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
    const primaryGoal = (fitnessProfile as UserFitnessProfile | null)?.primary_goal ?? null;
    const secondaryGoal = (fitnessProfile as UserFitnessProfile | null)?.secondary_goal ?? null;
    const weightUnit = (fitnessProfile as UserFitnessProfile | null)?.weight_unit ?? "kg";
    const analysisOptions = {
      bodyWeightKg,
      primaryGoal,
      secondaryGoal,
      weightUnit
    };
    const currentAnalysis = buildCurrentTrainingAnalysis(normalizedSets, analysisOptions);
    const visiblePreviousSessions = pickLatestVisibleTrainingSessionsByDate(
      ((previousSessionsData ?? []) as PreviousSessionForAnalysis[]),
      session.id,
      session.session_date
    );
    const previousAnalysis = buildPreviousTrainingAnalysis(
      visiblePreviousSessions,
      exerciseNames,
      analysisOptions
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
    const suggestedTargets = Object.fromEntries(
      currentAnalysis.exercises_summary.map((exercise) => [
        exercise.exercise_name,
        exercise.suggested_targets
      ])
    );
    const guardrailNotes = currentAnalysis.exercises_summary.flatMap((exercise) =>
      exercise.guardrail_notes.map((note) => ({
        exercise_name: exercise.exercise_name,
        note
      }))
    );
    const exerciseQualityContext = buildExerciseQualityContext(
      currentAnalysis,
      previousAnalysis
    );
    const nextMenuStructure = buildNextMenuStructure(suggestedTargets);
    const goalPolicy = buildGoalTrainingPolicy(primaryGoal, secondaryGoal);
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
        trend_label: compareCurrentToPrevious(
          exercise,
          previousAnalysis[exercise.exercise_name]
        ),
        previous: previousAnalysis[exercise.exercise_name] ?? {
          previous_sessions: [],
          previous_main_set: null,
          previous_repeated_main_performance: null,
          previous_best_set: null,
          previous_estimated_1rm: null,
          previous_total_volume: null,
          previous_total_sets: null,
          previous_total_reps: null,
          trend_last_3_sessions: "insufficient_data"
        }
      })),
      suggested_targets: suggestedTargets,
      guardrail_notes: guardrailNotes,
      exercise_quality_context: exerciseQualityContext,
      next_menu_structure: nextMenuStructure,
      goal_policy: goalPolicy,
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
            "あなたは筋トレ記録を分析するAIコーチです。初心者にも経験者にも通じる短い日本語で、パワーリフティングとボディメイクの両方を意識して診断します。医学的診断は避けます。痛み、違和感、既往歴、医療リスクが入力されている場合だけ専門家への相談を促し、通常の注意点では種目・重量構成・疲労に応じた実用的な注意を書いてください。ユーザー特性は入力済みの項目だけを使い、未入力項目は推測しません。overall_scoreは必ず100点満点の整数で返し、8.5のような10点満点表記は返さないでください。95〜100点は大幅PR更新、計画以上、疲労管理も非常に良い場合だけに限定し、良好でも改善余地がある内容は85〜90点程度にしてください。アプリ側で計算したセット分類、RM評価対象、suggested_targets、guardrail_notes、exercise_quality_context、next_menu_structureを最優先し、それらと矛盾する重量・回数・セット数を提案しないでください。最大重量、1回だけのトップシングル、メインセット、同重量の再現性、推定1RM、総ボリュームを分けて説明し、最大重量が下がった/上がったという表現を雑に使わないでください。必ずJSONだけを返してください。"
        },
        {
          role: "user",
          content: JSON.stringify({
            required_json_shape: {
              overall_score: "number 0-100",
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
            score_scale: 100,
            score_rubric: {
              "95_100": "大幅な自己ベスト更新、計画以上の非常に優れた内容。かなり限定的に使う。",
              "85_94": "非常に良好。メインセット再現性、推定1RM、ボリュームのいずれかが明確に良い。",
              "75_84": "良好。順調だが改善余地あり。",
              "60_74": "普通。維持または小さな改善。",
              "40_59": "やや不調。",
              "0_39": "大きく不調。"
            },
            instruction:
              "computed_analysisを最優先で使って、今日のセッション全体、種目別、前回比較、直近3回傾向を診断してください。overall_scoreは100点満点の整数で返し、85点相当なら85、75点相当なら75を返してください。8.5のような10点満点の値は返さないでください。点数はscore_rubricに従い、95〜100点は大幅PR更新、狙い通りの全セット達成、疲労管理も非常に良い場合だけに限定してください。良好でも後半の重量低下、筋肥大向けボリュームやレップレンジの改善余地がある場合は85〜90点程度にしてください。overall_labelは点数に合わせ、85〜94点は「非常に良好」、75〜84点は「良好」、60〜74点は「普通」、40〜59点は「やや不調」を目安にしてください。workout_sets.weight、computed_analysis内のweight、max_weight、estimated_1rmはkg正本です。表示文ではuser_fitness_context.profile.weight_unit、computed_analysisのdisplay_weight、estimated_1rm_display、suggested_targetsのdisplay_weight/textを使い、kg値をそのままlbとして表記しないでください。セット種別を尊重し、メインセットとRM評価対象セットを中心に判断してください。アップセットを通常セットとして評価せず、補助ありセットを実力値として過大評価せず、ドロップセットを筋力低下として誤解しないでください。推定1RMはestimated_1rm_from_rm_eligible_setsを中心に判断し、最大重量だけで下降判定しないでください。max_weightはその日の最大重量、top_singleは1回だけの高重量確認、main_setは主な評価対象、repeated_main_performanceは同重量で複数セットできたかを表します。今日の伸びでは、最大重量そのものの変化、トップシングル、メインセットの反復性能、再現性、推定1RM、総ボリュームを分けて説明してください。70kg×1と67.5kg×4がある場合は、70kgのシングルで高重量への適応を確認し、67.5kg帯での反復性能と再現性を見る、という形で表現してください。高重量確認後でもメイン重量帯の出力が落ちていない場合は、単発の強さと反復性能の両方が安定していると短く説明してください。「最大重量が70kgから67.5kgに向上」のように最大重量とメインセットを混同した矛盾表現は禁止です。前回比ではcomputed_analysis.exercises_summary[].previous、previous_sessions_used、exercise_quality_contextを使い、同重量での最大回数だけでなく、同重量のセット数、main_set、repeated_main_performance、estimated_1rm、working_total_volumeを比較してください。前回データがない、またはprevious_sessions_countが0の場合は、断定せず「前回データ不足」と明示してください。前回が67.5kg×4を1セット、今回が67.5kg×4を2セットなら、同重量・同回数を維持しつつ再現セット数が増えたと説明してください。前回も同等なら、高重量確認後でもメインセットを再現できた点を評価してください。declining判定は、推定1RM、working volume、同重量での回数、直近傾向が複数悪い場合に限定してください。cautionsは「専門家に相談してください」だけで終えず、種目・重量構成・疲労に応じた実用的な注意を書いてください。痛み、違和感、既往歴、医療リスクが入力されている場合だけ専門家相談の表現を使ってください。次回提案はsuggested_targetsとnext_menu_structureを優先して使い、今回達成済みのメインセットより明らかに弱い内容を主提案にしないでください。70kg×1が達成済みなら、candidate_e1rm_checkの範囲内でトップシングル候補として70kg×1〜2を出して構いませんが、70kgを高回数で提案しないでください。suggested_targetsやguardrail_notesと矛盾する提案は禁止です。suggested_targetsのcandidate_e1rm_checkを確認し、candidate_e1rmが現在のestimated_1rmを大きく超える重量・回数・セット数を提案しないでください。各exercise_diagnosticsにはnext_targetとsuggested_setsを必ず入れてください。suggested_setsはsuggested_targetsの優先候補から選んでください。next_workoutは具体的な重量・回数・セット数・実行順を含め、可能ならトップシングル→メインセット→バックオフの順で、そのまま実行できる文章にしてください。候補を羅列するだけでなく、余力がある場合と疲労が強い場合の逃げ道を一言入れてください。目的に応じて提案を分け、トレーナーが見ても無茶に感じる提案、トレーニーが見ても弱すぎる/強すぎる提案を避けてください。user_fitness_contextに目的や体組成がある場合だけ考慮してください。未入力情報は推測しないでください。日本語で、スマホで読みやすく、長すぎない文量にしてください。",
            goal_policy: goalPolicy,
            user_fitness_context: userFitnessContext,
            computed_analysis: computedAnalysis,
            exercise_quality_context: exerciseQualityContext,
            next_menu_structure: nextMenuStructure,
            suggested_targets: suggestedTargets,
            guardrail_notes: guardrailNotes
          })
        }
      ]
    });

    const content = completion.choices[0]?.message?.content ?? "{}";
    const report = calibrateReport(
      parseJsonReport(content),
      currentAnalysis,
      previousAnalysis
    );

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
            score_scale: 100,
            response: report,
            computed_analysis: computedAnalysis,
            exercise_diagnostics: report.exercise_diagnostics ?? [],
            suggested_targets: suggestedTargets,
            exercise_quality_context: exerciseQualityContext,
            next_menu_structure: nextMenuStructure,
            previous_sessions_used: previousSessionsUsed,
            user_fitness_context: userFitnessContext,
            guardrail_notes: guardrailNotes,
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
