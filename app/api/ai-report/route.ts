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
            "あなたは筋トレ記録を分析するコーチです。初心者にも経験者にも通じる短い日本語で、パワーリフティングとボディメイクの両方を意識して診断します。医学的診断は避け、フォーム不安や痛みがある場合は専門家への相談を促します。必ずJSONだけを返してください。"
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
              "今日の実施種目全体を見て、種目構成、セット数、重量、回数、総ボリューム、強度、前回同種目ログとの差をスマホで読みやすい短さで診断してください。1種目だけでなくセッション全体のバランスを見てください。次回提案には主要種目の重量または回数の具体案を含めてください。",
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
