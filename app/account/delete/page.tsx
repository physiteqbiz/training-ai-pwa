"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useMemo, useState } from "react";

import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

export default function AccountDeletePage() {
  const router = useRouter();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [email, setEmail] = useState("");
  const [reason, setReason] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    async function loadUser() {
      const {
        data: { user }
      } = await supabase.auth.getUser();

      if (!active) {
        return;
      }

      if (!user) {
        router.replace("/login");
        return;
      }

      setEmail(user.email ?? "");
      setCheckingAuth(false);
    }

    void loadUser();

    return () => {
      active = false;
    };
  }, [router, supabase]);

  async function submitDeletionRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!confirmed) {
      setError("確認チェックを入れてください。");
      return;
    }

    setLoading(true);
    setMessage("");
    setError("");

    try {
      const response = await fetch("/api/account/delete-request", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ reason })
      });
      const payload = (await response.json()) as { message?: string; error?: string };

      if (response.status === 401) {
        router.replace("/login");
        return;
      }

      if (!response.ok) {
        setError(payload.error ?? "アカウント削除依頼の送信に失敗しました。");
        return;
      }

      setMessage(
        payload.message ??
          "アカウント削除依頼を受け付けました。内容を確認のうえ、合理的な期間内に対応します。"
      );
      setReason("");
      setConfirmed(false);
    } catch {
      setError("アカウント削除依頼の送信に失敗しました。通信状態を確認してください。");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="screen">
      <header className="screen-header">
        <p className="eyebrow">Account</p>
        <h1>アカウント削除依頼</h1>
        <p className="muted">
          MVP/非公開ベータでは、即時自動削除ではなく依頼受付後に内容を確認して対応します。
        </p>
      </header>

      {checkingAuth ? <div className="status">ログイン状態を確認中です。</div> : null}
      {message ? <div className="status success">{message}</div> : null}
      {error ? <div className="status error">{error}</div> : null}

      {!checkingAuth ? (
        <form className="panel" onSubmit={submitDeletionRequest}>
          <div className="field">
            <span>ログイン中のメールアドレス</span>
            <p>{email || "確認中"}</p>
          </div>

          <label className="field">
            <span>削除理由（任意）</span>
            <textarea
              className="input textarea"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="差し支えなければ理由を入力してください。"
            />
          </label>

          <label className="check-row">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(event) => setConfirmed(event.target.checked)}
            />
            <span>
              アカウント削除を依頼すると、トレーニング記録、AI診断結果、体組成情報などが削除対象になることを理解しました。
            </span>
          </label>

          <button className="button danger full" disabled={loading} type="submit">
            {loading ? "送信中" : "アカウント削除を依頼する"}
          </button>
        </form>
      ) : null}

      <section className="panel compact-panel">
        <h2>削除前の確認</h2>
        <p className="muted">
          有料プランをご利用中の場合、先に設定画面の支払い管理からサブスクリプション状態を確認してください。
        </p>
      </section>

      <Link className="button secondary full" href="/settings">
        設定へ戻る
      </Link>
    </div>
  );
}
