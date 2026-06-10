import Link from "next/link";

const iphoneSteps = [
  "Safariでこのページを開く",
  "共有ボタンを押す",
  "「ホーム画面に追加」を選ぶ",
  "追加を押す"
];

const androidSteps = [
  "Chromeでこのページを開く",
  "メニューを押す",
  "「アプリをインストール」または「ホーム画面に追加」を選ぶ",
  "追加を押す"
];

export default function InstallPage() {
  return (
    <div className="screen">
      <header className="screen-header">
        <p className="eyebrow">スマホに追加</p>
        <h1>アプリのように使う</h1>
        <p className="muted">
          ホーム画面に追加すると、1タップでトレーニング記録を開始できます。
        </p>
      </header>

      <section className="panel">
        <div className="stack">
          <h2>iPhoneでホーム画面に追加</h2>
          <ol className="step-list">
            {iphoneSteps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </div>
        <p className="muted">ホーム画面から開くと、アプリのように全画面で使えます。</p>
        <div className="status">iPhoneでは、Safariからホーム画面に追加してください。</div>
      </section>

      <section className="panel">
        <div className="stack">
          <h2>Androidでホーム画面に追加</h2>
          <ol className="step-list">
            {androidSteps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </div>
        <p className="muted">端末によって表示名が少し異なる場合があります。</p>
      </section>

      <Link className="button secondary full" href="/">
        ホームへ戻る
      </Link>
    </div>
  );
}
