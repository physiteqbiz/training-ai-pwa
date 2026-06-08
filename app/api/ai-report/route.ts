import { NextResponse } from "next/server";
import OpenAI from "openai";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireEnv } from "@/lib/env";

export const runtime = "nodejs";

type ReportPayload = {
  summary: string;
  comparison: string;
  good_points: string;
  cautions: string;
  next_workout: string;
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

  return {
    summary: String(record.summary ?? ""),
    comparison: String(record.comparison ?? ""),
    good_points: String(record.good_points ?? ""),
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
      throw new Error("OpenAI response was not JSON.");
    }

    return normalizeReport(JSON.parse(match[0]));
  }
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

    const sets = (session.workout_sets ?? []) as Array<{
      exercise_name: string;
      weight: number | string;
      reps: number;
      set_order: number;
      exercise_order?: number;
    }>;

    if (sets.length === 0) {
      return NextResponse.json({ error: "Workout sets are empty." }, { status: 400 });
    }

    const exerciseSummary = [...new Set(sets.map((set) => set.exercise_name))].map(
      (exerciseName) => ({
        exercise_name: exerciseName,
        set_count: sets.filter((set) => set.exercise_name === exerciseName).length,
        sets: sets
          .filter((set) => set.exercise_name === exerciseName)
          .sort((a, b) => a.set_order - b.set_order)
          .map((set) => ({
            weight: set.weight,
            reps: set.reps,
            set_order: set.set_order,
            exercise_order: set.exercise_order ?? 0
          }))
      })
    );

    const exerciseNames = [...new Set(sets.map((set) => set.exercise_name))];
    const { data: previousSets } = await admin
      .from("workout_sets")
      .select(
        "exercise_name, weight, reps, set_order, created_at, workout_sessions!inner(session_date)"
      )
      .eq("user_id", user.id)
      .neq("session_id", sessionId)
      .in("exercise_name", exerciseNames)
      .order("created_at", { ascending: false })
      .limit(40);

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
            "あなたは筋トレ記録を分析するコーチです。初心者にも経験者にも通じる短い日本語で、パワーリフティングとボディメイクの両方を意識して診断します。医学的診断は避け、フォーム不安や痛みがある場合は専門家への相談を促します。ユーザー特性は入力済みの項目だけを使い、未入力項目は推測しません。必ずJSONだけを返してください。"
        },
        {
          role: "user",
          content: JSON.stringify({
            required_json_shape: {
              summary: "string",
              comparison: "string",
              good_points: "string",
              cautions: "string",
              next_workout: "string"
            },
            instruction:
              "今日の実施種目全体を見て、種目構成、セット数、重量、回数、総ボリューム、強度、前回同種目ログとの差をスマホで読みやすい短さで診断してください。1種目だけでなくセッション全体のバランスを見てください。次回提案には主要種目の重量または回数の具体案を含めてください。user_fitness_contextに入力済みのユーザー特性がある場合だけ考慮してください。体重がある場合だけ体重比を補助的に見てください。体脂肪率がない場合は体脂肪状態や減量状態を断定しないでください。骨格筋量、骨格筋率、筋肉量は同じものとして扱わず、測定機器がある場合も測定差を前提に断定しすぎないでください。目的が未入力の場合は一般的な筋肥大と筋力向上の両面から控えめに診断し、目的を決めつけないでください。",
            user_fitness_context: userFitnessContext,
            current_session: {
              session_date: session.session_date,
              title: session.title,
              exercise_summary: exerciseSummary,
              sets
            },
            previous_same_exercise_sets: previousSets ?? []
          })
        }
      ]
    });

    const content = completion.choices[0]?.message?.content ?? "{}";
    const report = parseJsonReport(content);

    if (
      !report.summary &&
      !report.comparison &&
      !report.good_points &&
      !report.cautions &&
      !report.next_workout
    ) {
      return NextResponse.json({ error: "AI report result was empty." }, { status: 500 });
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
            model: "gpt-4o-mini",
            response: report,
            user_fitness_context: userFitnessContext,
            previous_same_exercise_sets: previousSets ?? []
          }
        },
        { onConflict: "session_id" }
      )
      .select(
        "id, session_id, user_id, summary, comparison, good_points, cautions, next_workout"
      )
      .single();

    if (saveError || !savedReport) {
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
      return NextResponse.json(
        { error: statusError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ report: savedReport });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unexpected error." },
      { status: 500 }
    );
  }
}
