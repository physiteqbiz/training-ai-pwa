"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export default function PricingPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const checkout = new URLSearchParams(window.location.search).get("checkout");

    if (checkout === "cancel") {
      setMessage("決済はキャンセルされました。プランは変更されていません。");
    }
  }, []);

  async function startCheckout() {
    setLoading(true);
    setMessage("");
    setError("");

    try {
      const response = await fetch("/api/stripe/create-checkout-session", {
        method: "POST"
      });
      const payload = (await response.json()) as { url?: string; error?: string };

      if (response.status === 401) {
        router.push("/login");
        return;
      }

      if (!response.ok || !payload.url) {
        setError(payload.error ?? "決済画面を開けませんでした。");
        return;
      }

      window.location.href = payload.url;
    } catch {
      setError("決済画面を開けませんでした。通信状態を確認してください。");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="screen">
      <header className="screen-header">
        <p className="eyebrow">Pricing</p>
        <h1>Proプラン</h1>
        <p className="muted">Web/PWA版のStripe課金です。</p>
      </header>

      {message ? <div className="status success">{message}</div> : null}
      {error ? <div className="status error">{error}</div> : null}

      <section className="pricing-grid">
        <article className="plan-card">
          <div className="stack">
            <p className="eyebrow">Free</p>
            <h2>月額0円</h2>
          </div>
          <ul className="feature-list">
            <li>トレーニング記録</li>
            <li>前回履歴</li>
            <li>AI診断 月3回</li>
          </ul>
          <Link className="button secondary full" href="/">
            Freeで使う
          </Link>
        </article>

        <article className="plan-card plan-card--featured">
          <div className="stack">
            <p className="eyebrow">Pro</p>
            <h2>月額980円</h2>
          </div>
          <ul className="feature-list">
            <li>AI診断 月30回</li>
            <li>詳細AI診断v2</li>
            <li>種目別診断</li>
            <li>次回メニュー提案</li>
            <li>ユーザー特性反映</li>
            <li>今後、週次レポート追加予定</li>
          </ul>
          <button
            className="button full"
            disabled={loading}
            type="button"
            onClick={() => void startCheckout()}
          >
            {loading ? "決済画面を準備中" : "Proにアップグレード"}
          </button>
        </article>
      </section>

      <section className="panel">
        <h2>Web/PWA版向け</h2>
        <p className="muted">
          Stripe決済完了後、WebhookでDBに反映された時点でProとして扱います。
        </p>
        <p className="fine-print">
          ProはAI診断回数と詳細機能を拡張するプランです。AI診断は医療行為ではありません。決済処理はStripeを通じて行われます。
        </p>
      </section>
    </div>
  );
}
