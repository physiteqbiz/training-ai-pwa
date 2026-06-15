import Link from "next/link";

export default function ContactPage() {
  return (
    <div className="screen">
      <header className="screen-header">
        <p className="eyebrow">Contact</p>
        <h1>お問い合わせ</h1>
        <p className="muted">
          不具合、課金、アカウント、AI診断に関するご連絡はこちらをご確認ください。
        </p>
      </header>

      <section className="panel">
        <h2>問い合わせ先</h2>
        <p className="muted">
          お問い合わせ先は正式公開時に掲載予定です。非公開ベータ中は、案内を受け取った連絡先または運営者から指定された方法でご連絡ください。
        </p>
      </section>

      <section className="panel compact-panel">
        <h2>確認事項</h2>
        <p className="muted">
          AI診断は医療行為ではありません。痛みや体調不良がある場合は、医師その他の専門家に相談してください。
        </p>
      </section>

      <Link className="button secondary full" href="/">
        ホームへ戻る
      </Link>
    </div>
  );
}
