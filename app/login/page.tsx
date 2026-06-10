"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useMemo, useState } from "react";

import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

export default function LoginPage() {
  const router = useRouter();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [passwordEmail, setPasswordEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const authError = params.get("error");

    if (authError) {
      console.error("login callback error", authError);
      setError("ログイン状態を確認できませんでした。もう一度ログインしてください。");
    }
  }, []);

  async function signInWithPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    console.log("password login submit started");
    const formData = new FormData(event.currentTarget);
    const submittedEmail = String(formData.get("passwordEmail") ?? "").trim();
    const submittedPassword = String(formData.get("password") ?? "");

    setLoading(true);
    setError("");
    setMessage("ログイン中...");

    const { data, error: passwordError } = await supabase.auth.signInWithPassword({
      email: submittedEmail,
      password: submittedPassword
    });

    if (passwordError || !data.user) {
      const errorMessage = passwordError?.message ?? "ログインに失敗しました。";
      console.error("password login error", errorMessage);
      setError("メールアドレスまたはパスワードが正しくありません。");
      setMessage("");
      setLoading(false);
      return;
    }

    console.log("password login success");
    setMessage("ログインしました。ホームへ移動します。");
    setLoading(false);
    router.replace("/");
    router.refresh();
  }

  return (
    <div className="screen">
      <header className="screen-header">
        <h1>筋トレ診断AI</h1>
        <p className="muted">
          トレーニング記録をもとに、AIが今日の内容と次回メニューを提案します。
        </p>
      </header>

      <form className="panel" onSubmit={signInWithPassword}>
        <label className="field">
          <span>メールアドレス</span>
          <input
            className="input"
            name="passwordEmail"
            type="email"
            autoComplete="email"
            value={passwordEmail}
            onChange={(event) => setPasswordEmail(event.target.value)}
            required
          />
        </label>
        <label className="field">
          <span>パスワード</span>
          <input
            className="input"
            name="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
        </label>
        <button
          className="button full"
          disabled={loading}
          type="submit"
        >
          {loading ? "ログイン中..." : "ログイン"}
        </button>
        <p className="muted">
          アカウント作成がまだの場合は、管理者から発行されたログイン情報を使用してください。
        </p>
      </form>

      {message ? <div className="status">{message}</div> : null}
      {error ? <div className="status error">{error}</div> : null}
    </div>
  );
}
