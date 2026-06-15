"use client";

import Link from "next/link";
import { FormEvent, useMemo, useState } from "react";

import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

function getSignupErrorMessage(errorMessage: string) {
  const normalized = errorMessage.toLowerCase();

  if (normalized.includes("password")) {
    return "パスワードは8文字以上で入力してください。";
  }

  if (normalized.includes("already") || normalized.includes("registered")) {
    return "メールアドレスが既に登録されている可能性があります。";
  }

  if (normalized.includes("email")) {
    return "メールアドレスを確認してください。";
  }

  if (normalized.includes("rate limit") || normalized.includes("rate")) {
    return "登録メールの送信が混み合っています。時間をおいて再度お試しください。";
  }

  return "登録に失敗しました。時間をおいて再度お試しください。";
}

export default function SignupPage() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function signUp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleanEmail = email.trim();

    setMessage("");
    setError("");

    if (password.length < 8) {
      setError("パスワードは8文字以上で入力してください。");
      return;
    }

    if (password !== passwordConfirm) {
      setError("パスワードが一致していません。");
      return;
    }

    setLoading(true);

    const { error: signupError } = await supabase.auth.signUp({
      email: cleanEmail,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`
      }
    });

    if (signupError) {
      console.error("signup error", signupError.message);
      setError(getSignupErrorMessage(signupError.message));
      setLoading(false);
      return;
    }

    setMessage(
      "確認メールを送信しました。メール内のリンクを開いて登録を完了してください。メールが届かない場合は、迷惑メールフォルダも確認してください。届くまで数分かかる場合があります。"
    );
    setPassword("");
    setPasswordConfirm("");
    setLoading(false);
  }

  return (
    <div className="screen">
      <header className="screen-header">
        <h1>アカウント作成</h1>
        <p className="muted">
          メールアドレスとパスワードを登録して、トレーニング記録を始めます。
        </p>
      </header>

      <form className="panel" onSubmit={signUp}>
        <label className="field">
          <span>メールアドレス</span>
          <input
            className="input"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
        </label>
        <label className="field">
          <span>パスワード</span>
          <input
            className="input"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
          <small className="field-hint">パスワードは8文字以上で入力してください。</small>
        </label>
        <label className="field">
          <span>パスワード確認</span>
          <input
            className="input"
            type="password"
            autoComplete="new-password"
            value={passwordConfirm}
            onChange={(event) => setPasswordConfirm(event.target.value)}
            required
          />
        </label>
        <button className="button full" disabled={loading} type="submit">
          {loading ? "送信中..." : "アカウント作成"}
        </button>
        <p className="muted">
          登録後、確認メールを送信します。メール内のリンクを開くと登録が完了します。
        </p>
      </form>

      {message ? <div className="status success">{message}</div> : null}
      {error ? <div className="status error">{error}</div> : null}

      <Link className="button secondary full" href="/login">
        ログインへ戻る
      </Link>

      <p className="fine-print">
        登録またはログインすることで、
        <Link href="/terms">利用規約</Link>
        および
        <Link href="/privacy">プライバシーポリシー</Link>
        に同意したものとみなされます。
      </p>
    </div>
  );
}
