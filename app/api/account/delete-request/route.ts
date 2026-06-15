import { NextResponse } from "next/server";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

function summarizeError(error: unknown) {
  if (!error || typeof error !== "object") {
    return { message: error instanceof Error ? error.message : "Unknown error." };
  }

  const record = error as Record<string, unknown>;

  return {
    message: String(record.message ?? "Unknown error."),
    code: record.code ? String(record.code) : undefined,
    details: record.details ? String(record.details) : undefined,
    hint: record.hint ? String(record.hint) : undefined
  };
}

export async function POST(request: Request) {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user }
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "ログインが必要です。" }, { status: 401 });
    }

    const body = (await request.json().catch(() => ({}))) as { reason?: string };
    const reason = typeof body.reason === "string" ? body.reason.trim() : "";
    const admin = createSupabaseAdminClient();
    const { data: existingRequest, error: existingError } = await admin
      .from("account_deletion_requests")
      .select("id, status, requested_at")
      .eq("user_id", user.id)
      .in("status", ["requested", "processing"])
      .order("requested_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existingError) {
      console.error("account deletion request lookup error", {
        userId: user.id,
        error: summarizeError(existingError)
      });

      return NextResponse.json(
        { error: "アカウント削除依頼の確認に失敗しました。時間をおいて再度お試しください。" },
        { status: 500 }
      );
    }

    if (existingRequest) {
      return NextResponse.json({
        ok: true,
        already_requested: true,
        message: "アカウント削除依頼は既に受け付け済みです。"
      });
    }

    const { error: insertError } = await admin.from("account_deletion_requests").insert({
      user_id: user.id,
      email: user.email ?? null,
      reason: reason || null,
      status: "requested"
    });

    if (insertError) {
      console.error("account deletion request insert error", {
        userId: user.id,
        error: summarizeError(insertError)
      });

      return NextResponse.json(
        { error: "アカウント削除依頼の送信に失敗しました。時間をおいて再度お試しください。" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      message: "アカウント削除依頼を受け付けました。内容を確認のうえ、合理的な期間内に対応します。"
    });
  } catch (error) {
    console.error("account deletion request api error", {
      error: summarizeError(error)
    });

    return NextResponse.json(
      { error: "アカウント削除依頼の送信に失敗しました。時間をおいて再度お試しください。" },
      { status: 500 }
    );
  }
}
