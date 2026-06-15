# training-ai-pwa

筋トレ記録とAI診断の最速MVPです。Next.js App Router、TypeScript、Supabase Auth/PostgreSQL、OpenAI API、PWAで構成しています。

## 実装済み機能

- 非公開ベータ向けメールアドレス＋パスワードログイン
- メールアドレス＋パスワードの新規アカウント作成
- トレーニングセッション作成
- 種目、重量、回数、セット保存
- 前回同種目ログ表示
- 保存済みセッションへのAI診断生成
- AI診断v2の構造化表示
- 今日の要約、前回比、良かった点、注意点、次回メニュー提案の表示
- ログイン中メールアドレス表示とログアウト
- `manifest.json`、アプリアイコン、theme color、standalone、safe area対応、最低限Service Worker
- 任意のユーザー特性、目的、最新体組成の保存
- ホーム画面追加の案内カードと `/install` の追加手順ページ
- Web/PWA版向けStripe Checkout、Webhook、Customer PortalのPro課金基盤
- AI診断の月次利用枠管理（Free月3回、Pro月30回）
- MVP/非公開ベータ向けの `/terms`、`/privacy`、`/account/delete`、`/contact`
- アカウント削除依頼の受付

## 未実装機能

- Apple Watch連携
- 食事管理
- 睡眠管理
- SNS機能
- Push通知
- オフライン保存
- 高度なグラフ
- App Store対応
- Googleログイン
- Appleログイン

## 必要な環境変数

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SECRET_KEY=
OPENAI_API_KEY=
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=
STRIPE_PRICE_ID_PRO_MONTHLY=
DEV_USER_EMAIL=
DEV_USER_PASSWORD=
```

クライアント側で使うのは `NEXT_PUBLIC_SUPABASE_URL`、`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`、`NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` のみです。`SUPABASE_SECRET_KEY`、`OPENAI_API_KEY`、`STRIPE_SECRET_KEY`、`STRIPE_WEBHOOK_SECRET` はサーバー側だけで使います。

## ログインとアカウント作成

ログインはメールアドレス＋パスワード方式です。新規登録は `/signup` から行えます。登録後、確認メール内のリンクを開くと `/auth/callback` を経由して認証が完了し、ホームへ移動します。

開発用ユーザーは以下で作成できます。

```bash
npm run create:dev-user
```

現在は新規登録導線を開放しています。非公開ベータで登録を制限したい場合は、後で招待コードまたはDBベースの招待制を追加してください。

登録確認メールは現時点ではSupabase標準メールで送信しています。標準メールは開発・初期検証用で、到達遅延、iCloudメールへの未達、rate limitが起きる可能性があります。本番運用や非公開ベータ以降では、Resend、SendGrid、Amazon SESなどの独自SMTP利用を推奨します。Custom SMTPへ切り替えても、アプリ側の `signUp` 導線は基本的にそのまま使えます。

## Supabase SQL

Supabase SQL Editorで以下を実行してください。

- `supabase/migrations/20260607000000_initial_mvp.sql`
- `supabase/migrations/20260607001000_grant_authenticated_table_access.sql`
- `supabase/migrations/20260608000000_exercise_catalog.sql`
- `supabase/migrations/20260608001000_workout_set_exercise_order.sql`
- `supabase/migrations/20260608002000_ai_report_status.sql`
- `supabase/migrations/20260608003000_user_fitness_profile.sql`
- `supabase/migrations/20260608004000_billing_and_ai_usage.sql`
- `supabase/migrations/20260608005000_account_deletion_requests.sql`

`user_fitness_profiles` と `body_measurements` もSupabase SQL Editorでmigrationを実行して作成してください。ユーザー特性、目的、体組成はすべて任意入力です。未入力でもトレーニング記録とAI診断は利用できます。

体組成の骨格筋量、骨格筋率、筋肉量は、InBody、TANITA、ジムの業務用マシン、家庭用体組成計など測定機器によって定義や表示が異なる場合があります。分かる項目だけ入力してください。

課金用migrationでは `profiles` にStripe Customer、サブスク状態、AI診断利用枠のカラムを追加し、`ai_usage_logs` を作成します。`ai_usage_logs` は本人のみread可能です。AI診断の利用カウントはサーバー側で行い、通常のクライアントからはinsert/updateできない前提です。

アカウント削除依頼用migrationでは `account_deletion_requests` を作成します。本人は自分の削除依頼をread/insertできます。MVPでは即時自動削除ではなく、依頼を保存して内容確認後に対応する運用です。

## AI診断v2

AI診断v2では、セッション全体、種目別の総ボリューム、最大重量、推定1RM、前回比較、直近3回傾向、ユーザー目的を考慮して診断します。API側で計算できる分析値を先に作成し、AIにはその計算済みデータを渡します。

診断本文は既存の `summary`、`comparison`、`good_points`、`cautions`、`next_workout` にも保存し、詳細なv2構造、計算済み分析、ユーザー特性は `ai_reports.raw_json` に保存します。

古いAI診断データにv2構造がない場合でも、画面では従来の `summary` / `comparison` / `good_points` / `cautions` / `next_workout` を使って後方互換表示します。

AI診断は、入力されたトレーニング記録等に基づく一般的なフィットネス助言です。医療行為、診断、治療、リハビリ指導を目的とするものではありません。痛み、違和感、体調不良、既往歴、持病がある場合は、医師その他の専門家に相談してください。

## Stripe課金（Web/PWA版）

今回の課金導線はWeb/PWA版向けです。`/pricing` からProにアップグレードすると、`/api/stripe/create-checkout-session` がStripe Checkout Sessionを作成し、Stripeの決済画面へ遷移します。

Checkoutの `success_url` は `/settings?checkout=success` ですが、戻ってきただけではPro化しません。Stripe決済の成功やサブスク状態の変更は、必ず `/api/stripe/webhook` の署名検証済みWebhookでDBへ反映します。

Webhookで処理するイベントは次の通りです。

- `checkout.session.completed`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.payment_failed`

Proユーザーは `/settings` の「支払い管理」から `/api/stripe/create-portal-session` を経由してStripe Customer Portalを開き、支払い方法やサブスク状態を管理できます。

Stripe Dashboardでは次を設定してください。

- Pro月額980円相当のRecurring Priceを作成し、Price IDを `STRIPE_PRICE_ID_PRO_MONTHLY` に設定する
- Webhook Endpointに `https://<your-domain>/api/stripe/webhook` を登録する
- Webhook Signing Secretを `STRIPE_WEBHOOK_SECRET` に設定する

Play Store版を将来出す場合は、Play Storeアプリ内で外部決済へ誘導しない設計に注意してください。Web/PWAではStripeでPro課金を検証し、Play Store版ではGoogle Play Billingまたは外部決済プログラムを別途検討します。

決済情報の処理はStripeを通じて行われ、このアプリはクレジットカード番号を直接保存しません。プラン状態、サブスクリプション状態、AI診断利用枠はSupabase側の `profiles` に保存します。

## 法務・サポート導線

MVP/非公開ベータ向けの初期文言として、以下のページを用意しています。正式公開前には必要に応じて専門家確認を行い、法務文言を見直す想定です。

- `/terms`: 利用規約。サービス概要、AI診断の位置付け、医療行為ではないこと、有料プラン、解約、免責を記載します。
- `/privacy`: プライバシーポリシー。取得する情報、利用目的、Supabase/Vercel/OpenAI/Stripeの利用、アカウント削除を記載します。
- `/account/delete`: アカウント削除依頼。ログイン済みユーザーが削除依頼を送信し、`account_deletion_requests` に保存します。
- `/contact`: 問い合わせ導線。正式公開時に問い合わせ先を掲載する前提の案内を表示します。

ログイン画面と新規登録画面には、利用規約とプライバシーポリシーへの導線を表示します。設定画面には、利用規約、プライバシーポリシー、アカウント削除依頼、お問い合わせへのリンクを表示します。

## Supabase Auth URL設定

メール確認リンクを開くため、Supabase DashboardのAuth URL Configurationを次のように設定してください。

Site URL:

```text
https://training-ai-pwa.vercel.app
```

Redirect URLs:

```text
https://training-ai-pwa.vercel.app/**
https://training-ai-pwa.vercel.app/auth/callback
http://localhost:3001/**
http://localhost:3001/auth/callback
```

メールリンクは `/auth/callback` で `code` を受け取り、Supabaseの `exchangeCodeForSession(code)` でセッションcookieに保存してから `/` へ戻します。

## ローカル起動

```bash
npm install
cp .env.example .env.local
npm run dev -- --port 3001
```

`.env.local` にSupabaseとOpenAIの値を入れてから、`http://localhost:3001` を開きます。

## スマホへの追加

このアプリはホーム画面に追加して、スマホアプリのように起動できます。ログイン後のホームには「アプリのように使う」案内カードが表示され、`/install` で追加方法を確認できます。

- iPhone: Safariで開き、共有ボタンから「ホーム画面に追加」を選びます。
- Android: Chromeで開き、メニューから「アプリをインストール」または「ホーム画面に追加」を選びます。

## メール送信なしのローカル検証

Supabase標準メールのrate limitや到達遅延を避けるため、ローカル検証では確認済みの開発用ユーザーを作成してメールアドレス＋パスワードログインを使います。

1. `.env.local` にSupabase、OpenAI、開発用ユーザーの値を設定します。
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
   - `SUPABASE_SECRET_KEY`
   - `OPENAI_API_KEY`
   - `DEV_USER_EMAIL`
   - `DEV_USER_PASSWORD`
2. 依存関係を入れます。
   ```bash
   npm install
   ```
3. 確認済み開発用ユーザーを作成します。
   ```bash
   npm run create:dev-user
   ```
4. ローカルサーバーを起動します。
   ```bash
   npm run dev -- --port 3001
   ```
5. `http://localhost:3001/login` で `DEV_USER_EMAIL` / `DEV_USER_PASSWORD` を使ってログインします。
6. トレーニング記録保存とAI診断を検証します。

## Vercelデプロイ

1. VercelでGitHub repository `training-ai-pwa` をImportします。
2. Framework PresetはNext.jsを選びます。
3. Environment Variablesに次を登録します。
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
   - `SUPABASE_SECRET_KEY`
   - `OPENAI_API_KEY`
   - `STRIPE_SECRET_KEY`
   - `STRIPE_WEBHOOK_SECRET`
   - `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`
   - `STRIPE_PRICE_ID_PRO_MONTHLY`
4. Supabase AuthのSite URLにVercel URLを設定します。
5. 必要に応じてSupabase AuthのRedirect URLsにローカルとVercel URLを追加します。
6. Deployします。

## 動作確認

1. `/signup` でメールアドレスとパスワードを入力し、確認メールを送信します。
2. メール内リンクから `/auth/callback` を経由して登録を完了します。
3. `/login` でメールアドレスとパスワードを入力してログインします。
4. ホームから「今日のトレーニングを記録する」を開きます。
5. `ベンチプレス`、`100kg`、`8回` のセットを保存します。
6. AI診断画面に遷移し、診断が生成されることを確認します。
7. もう一度同じ種目を入力し、前回同種目ログが表示されることを確認します。
8. `/terms`、`/privacy`、`/contact` が表示されることを確認します。
9. ログイン後、`/account/delete` から削除依頼を送信できることを確認します。

## 注意点

- Supabase RLSを前提にしています。migrationを実行しないと記録保存や参照は動きません。
- AI診断APIはOpenAI API利用料が発生します。
- AI診断は医療行為ではありません。トレーニングは利用者自身の体調、経験、環境に応じて無理のない範囲で行ってください。
- Stripe課金はWeb/PWA版向けです。Play Store版では課金ルールに注意し、Google Play Billingまたは外部決済プログラムを別途検討してください。
- Stripe決済、個人情報、体組成情報、アカウント削除依頼に関する文言はMVP/非公開ベータ向けの初期版です。正式公開前に必要に応じて見直してください。
- Service Workerは最低限の登録だけです。オフライン保存は未実装です。
- 確認メールは現時点ではSupabase標準メールです。本番運用では独自SMTPへの切り替えを推奨します。
- 同じユーザー・同じ日付のセッションはUI側で最新1件を再利用します。将来的には `unique(user_id, session_date)` 制約、または既存同日セッションのマージ処理を検討してください。
