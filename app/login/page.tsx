"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useMemo, useState } from "react";

import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

export default function LoginPage() {
  const router = useRouter();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [passwordEmail, setPasswordEmail] = useState("");
  const [password, setPassword] = useState("");
  const [otpEmail, setOtpEmail] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const authError = params.get("error");

    if (authError) {
      setError(authError);
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
      setError(errorMessage);
      setMessage("");
      setLoading(false);
      return;
    }

    console.log("password login success");
    setMessage("ログイン成功。ホームへ移動します。");
    setLoading(false);
    router.replace("/");
    router.refresh();
  }

  async function sendOtp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    setMessage("");

    const { error: otpError } = await supabase.auth.signInWithOtp({
      email: otpEmail,
      options: {
        shouldCreateUser: true,
        emailRedirectTo: `${window.location.origin}/auth/callback`
      }
    });

    if (otpError) {
      setError(otpError.message);
    } else {
      setSent(true);
      setMessage("6桁コードを送信しました。");
    }

    setLoading(false);
  }

  async function verifyOtp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    setMessage("");

    const { data, error: verifyError } = await supabase.auth.verifyOtp({
      email: otpEmail,
      token: otpCode,
      type: "email"
    });

    if (verifyError || !data.user) {
      setError(verifyError?.message ?? "ログインに失敗しました。");
      setLoading(false);
      return;
    }

    router.replace("/");
  }

  return (
    <div className="screen">
      <header className="screen-header">
        <p className="eyebrow">Dev Login</p>
        <h1>筋トレ診断AI</h1>
        <p className="muted">ローカル検証ではメール＋パスワードログインを使います。</p>
      </header>

      <form className="panel" onSubmit={signInWithPassword}>
        <div className="screen-header">
          <p className="eyebrow">メール＋パスワードログイン</p>
          <h2>開発用ログイン</h2>
        </div>
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
          {loading ? "ログイン中..." : "メール＋パスワードでログイン"}
        </button>
      </form>

      <details className="panel">
        <summary>メールコードログイン（後で調整）</summary>
        <form className="stack" onSubmit={sendOtp}>
          <label className="field">
            <span>メールアドレス</span>
            <input
              className="input"
              type="email"
              autoComplete="email"
              value={otpEmail}
              onChange={(event) => setOtpEmail(event.target.value)}
              required
            />
          </label>
          <button className="button full" disabled={loading || !otpEmail} type="submit">
            OTP送信
          </button>
        </form>

        <form className="stack" onSubmit={verifyOtp}>
          <label className="field">
            <span>6桁コード</span>
            <input
              className="input"
              inputMode="numeric"
              maxLength={6}
              pattern="[0-9]{6}"
              value={otpCode}
              onChange={(event) => setOtpCode(event.target.value.replace(/\D/g, ""))}
              required
            />
          </label>
          <button
            className="button full"
            disabled={loading || !sent || otpCode.length !== 6}
            type="submit"
          >
            OTP検証
          </button>
        </form>
      </details>

      {message ? <div className="status">{message}</div> : null}
      {error ? <div className="status error">{error}</div> : null}
    </div>
  );
}
