# training-ai-pwa

筋トレ記録とAI診断の最速MVPです。Next.js App Router、TypeScript、Supabase Auth/PostgreSQL、OpenAI API、PWAで構成しています。

## 実装済み機能

- メールアドレスOTPログイン
- トレーニングセッション作成
- 種目、重量、回数、セット保存
- 前回同種目ログ表示
- 保存済みセッションへのAI診断生成
- 今日の要約、前回比、良かった点、注意点、次回メニュー提案の表示
- ログイン中メールアドレス表示とログアウト
- `manifest.json`、アプリアイコン、theme color、standalone、safe area対応、最低限Service Worker
- 開発用メール＋パスワードログイン
- 任意のユーザー特性、目的、最新体組成の保存

## 未実装機能

- Stripe課金
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
DEV_USER_EMAIL=
DEV_USER_PASSWORD=
```

クライアント側で使うのは `NEXT_PUBLIC_SUPABASE_URL` と `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` のみです。`SUPABASE_SECRET_KEY` と `OPENAI_API_KEY` はサーバー側だけで使います。

## Supabase SQL

Supabase SQL Editorで以下を実行してください。

- `supabase/migrations/20260607000000_initial_mvp.sql`
- `supabase/migrations/20260607001000_grant_authenticated_table_access.sql`
- `supabase/migrations/20260608000000_exercise_catalog.sql`
- `supabase/migrations/20260608001000_workout_set_exercise_order.sql`
- `supabase/migrations/20260608002000_ai_report_status.sql`
- `supabase/migrations/20260608003000_user_fitness_profile.sql`

`user_fitness_profiles` と `body_measurements` もSupabase SQL Editorでmigrationを実行して作成してください。ユーザー特性、目的、体組成はすべて任意入力です。未入力でもトレーニング記録とAI診断は利用できます。

体組成の骨格筋量、骨格筋率、筋肉量は、InBody、TANITA、ジムの業務用マシン、家庭用体組成計など測定機器によって定義や表示が異なる場合があります。分かる項目だけ入力してください。

## Supabase Auth URL設定

ローカル検証でメール内Confirm link / Magic LinkをMacで開く場合、Supabase DashboardのAuth URL Configurationを次のように設定してください。

- Site URL: `http://localhost:3001`
- Redirect URLs:
  - `http://localhost:3001/**`
  - `http://localhost:3001/auth/callback`

メールリンクは `/auth/callback` で `code` を受け取り、Supabaseの `exchangeCodeForSession(code)` でセッションcookieに保存してから `/` へ戻します。

## ローカル起動

```bash
npm install
cp .env.example .env.local
npm run dev -- --port 3001
```

`.env.local` にSupabaseとOpenAIの値を入れてから、`http://localhost:3001` を開きます。

## メール送信なしのローカル検証

Supabase標準メールのrate limitや到達遅延を避けるため、ローカル検証では確認済みの開発用ユーザーを作成してメール＋パスワードログインを使います。

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
4. Supabase AuthのSite URLにVercel URLを設定します。
5. 必要に応じてSupabase AuthのRedirect URLsにローカルとVercel URLを追加します。
6. Deployします。

## 動作確認

1. メールアドレスを入力してOTPを送信します。
2. 6桁コードを入力してログインします。
3. ホームから「今日のトレーニングを記録する」を開きます。
4. `ベンチプレス`、`100kg`、`8回` のセットを保存します。
5. AI診断画面に遷移し、診断が生成されることを確認します。
6. もう一度同じ種目を入力し、前回同種目ログが表示されることを確認します。

## 注意点

- Supabase RLSを前提にしています。migrationを実行しないと記録保存や参照は動きません。
- AI診断APIはOpenAI API利用料が発生します。
- Service Workerは最低限の登録だけです。オフライン保存は未実装です。
- Supabase OTPメールの送信設定やドメイン設定はSupabase側の設定に依存します。
- 同じユーザー・同じ日付のセッションはUI側で最新1件を再利用します。将来的には `unique(user_id, session_date)` 制約、または既存同日セッションのマージ処理を検討してください。
