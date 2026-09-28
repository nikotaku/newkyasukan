# CLAUDE.md

このリポジトリで作業する際のガイドライン。

## デプロイ方針（重要）

**変更が完了したら、確認を待たずに自動で本番反映（mainへマージ）すること。**

毎回の作業フローは以下の通り：

1. `claude/gifted-maxwell-inpQS` ブランチで開発する
2. `npm run build` でビルドが通ることを確認する
3. コミット＆プッシュする
4. PR を作成する（既存PRがあればそのまま使う）
5. **ユーザーに「本番反映して」と言われるのを待たず、PRを `draft: false` にして squash マージで main に取り込む**
6. DBスキーマ変更・Edge Function 変更がある場合は、Supabase MCP で本番プロジェクト（`imrxzkivwrkqbhqfbbes`）に直接適用・デプロイする

※ ユーザーから明示的に「マージしないで」「確認してから」と指示された場合のみ、この自動マージをスキップする。

## CI について

- **Workers Builds（Cloudflare）の失敗は既存のダッシュボード設定起因の問題**で、コードとは無関係。毎pushで失敗するが対応不要。
- Vercel が success していればコードは正常。Vercel が本番デプロイ環境。
- Supabase Preview の「concurrent preview branches 上限」通知も対応不要。DBスキーマ変更は MCP で本番に直接適用する運用。

## ビルド・開発コマンド

- `npm run build` — 本番ビルド（プッシュ前に必ず確認）
- `npm run dev` — 開発サーバー
- `npm run lint` — ESLint

## 構成

- フロントエンド: React + Vite + TypeScript + Tailwind + shadcn/ui
- バックエンド: Supabase（DB / Auth / Storage / Edge Functions）
- 本番Supabaseプロジェクト ID: `imrxzkivwrkqbhqfbbes`
- 公開ページ: `src/pages/public/` 配下
- 管理画面: `src/pages/` 配下

## マルチテナント（店舗）構成

1リポジトリ・1デプロイで複数店舗を運用する構成。店舗ごとのコードコピーは絶対に作らない。

- **stores テーブル**が店舗マスタ（slug = サブドメイン、name / logo_url / theme_color / settings）
- **デフォルト店舗ID**: `00000000-0000-0000-0000-000000000001`（slug: `main`、既存データはすべてここに帰属）
- **全テーブルに `store_id`** があり、INSERT時はトリガー `set_store_id()` がログインユーザーの所属店舗で自動補完
- **RLS**: 既存の許可ポリシーに加え、各テーブルに `store_isolation`（RESTRICTIVE）が重なっており、authenticated ユーザーは `user_stores` で紐付いた店舗のデータしか読み書きできない。anon（公開サイト・セラピストポータル）は対象外
- **ユーザー⇔店舗の紐付け**: `user_stores`（user_id, store_id, role: owner/manager/staff）
- **フロント**: `src/hooks/useStore.tsx` の `StoreProvider` がサブドメインから店舗を解決（localhost / *.vercel.app / apex / www はデフォルト店舗）。公開ページは `useStore()` の `storeId` でクエリをフィルタする
- **複合PK**: `site_content` (store_id, key) / `monthly_reports` (store_id, month_date)

### 店舗追加の手順

1. `insert into stores (slug, name) values ('tenant-b', '○○店');`
2. その店舗の管理ユーザーを auth に作成し `insert into user_stores (user_id, store_id, role) values (..., ..., 'owner');`
3. Vercel にワイルドカード/カスタムドメインを設定（`tenant-b.ドメイン` → 同一デプロイ）
4. コード変更は不要

### 残タスク（2店舗目投入前に対応）

- 公開ページの店舗フィルタ未配線箇所（Pricing / System / Access / CastDetail / 共通コンポーネント / `record_page_view` RPC）
- セラピストポータル（access_token・anon経由）の書き込みはRESTRICTIVEポリシー対象外のため、店舗をまたぐtokenの一意性で実質分離されている。厳密化する場合はRPC化が必要

## CRM（顧客の好み・営業管理）

- **customer_profiles**（customer_id PK）: 圧の好み・気になる部位・会話の好み・NG/アレルギー・好みメモ
- **customer_followups**: 営業フォロー履歴（日付・手段・内容・次回アクション日）
- **customers** に統計カラム（visit_count / total_spent / last_visited / last_cast_id / tags / is_banned）。reservations の completed をトリガー `trg_sync_customer_stats` が電話番号マッチで自動集計（電話番号正規化は `norm_phone()`）
- 顧客ランクは `src/lib/customerRank.ts` でフロント算出（VIP / 常連 / リピーター / 新規）
- 管理画面: `/database/customers` のタブ（顧客一覧 / 好み / 営業）。営業タブの行クリックで顧客カルテ（来店履歴・フォロー履歴・VIPフラグ）
- 予約フォーム（ReservationForm）に「お客様の好み（電話ヒアリング）」欄。予約登録時に customer_profiles へ自動保存（新規顧客は customers も自動作成）
- セラピストポータル: RPC `get_therapist_customers(p_token)` で担当顧客のカルテを読み取り専用表示
- `site_content` の upsert は複合PKのため `onConflict: "store_id,key"` を使うこと

## LINE通知

- メインの公式アカウント（`LINE_CHANNEL_ACCESS_TOKEN`）は日報・シフト・セラピスト共有などで月間上限（429）に達しやすい
- WEB予約通知（`notify-line-booking`）は**予約通知専用の公式アカウント**（`LINE_BOOKING_CHANNEL_ACCESS_TOKEN`）から優先して送り、失敗したらメインアカウント → メールの順に逃がす
- お客様からのSMS返信（Twilio → `sms-webhook`）も予約通知専用アカウントの `web_booking` グループへ通知する。こちらから送ったことのある番号の返信だけが対象。専用アカウントの無料枠はWEB予約通知を優先するため、残りがWEB予約15回分を切ったらSMS返信の通知は止め、メインアカウント（`operations`）へ回す（`sms-webhook/smsLineNotification.ts`）
- 専用アカウントの送信先は `line_notification_destinations`（destination_key = `web_booking`）。グループ内で管理者が「予約通知登録」と送ると Webhook `line-booking-webhook` が登録する
- 専用アカウント（艶華スタッフアカウント）の認証情報は Vault の `line_booking_channel_id` / `line_booking_channel_secret`。RPC `get_line_booking_channel()`（service_roleのみ）で読み、15分有効のステートレストークンをその都度発行する（`_shared/lineBookingChannel.ts`）。このチャネルのWebhook URLは `line-booking-webhook`（以前のRailwayの `zenryoku-line-bot` は使用終了）
- 予約通知用アカウントは既存アカウントとプロバイダーが違うため、管理者IDが一致しない。管理者以外の「予約通知登録」は、署名検証済みの依頼としてグループIDを関数ログに残す（`Unauthorized booking destination request`）ので、運用者が `line_notification_destinations` に `web_booking` として登録する
- Edge FunctionのSecrets `LINE_BOOKING_CHANNEL_ACCESS_TOKEN` / `LINE_BOOKING_CHANNEL_SECRET` があればそちらを優先（管理者IDはプロバイダーが違う場合のみ `LINE_BOOKING_ADMIN_USER_IDS`）

## 教育・媒体登録・SNS連携（/education）

- セラピストの講習状況・媒体登録状況・SNS連携を1画面で管理する（タブは `?tab=status|media|sns|curriculum`）
- 媒体登録状況（`src/components/education/MediaRegistrationMatrix.tsx`）: エステ魂・O2・Xの登録を1表で見て切り替える。手でチェックする項目は casts の真偽値列（`estama_listed` など、スタッフ画面の「登録・SNS準備」と同じ）、「自動連携」「魂セラピスト」「ログイン情報」は `external_cast_profiles` と `get_sns_connection_overview_v9` から自動で出す（`src/lib/mediaRegistration.ts`）
- エスラン（メンズエステランキング）は今は掲載していないので、`src/lib/mediaRegistration.ts` の `ESTHE_RANKING_ACTIVE = false` で登録状況の列・スタッフ画面のチェック・セラピストDBのランキング転記・シフトのエスラン登録欄を隠している。掲載を再開したら true に戻す（データは残してある）
- SNS連携・ログイン情報は `src/pages/O2Management.tsx`（教育画面のタブとして表示）。以前の `/marketing/o2` は `/education?tab=sns` へ転送

## 予約案内ページ（SMSのリンク先）

- 予約ごとの案内ページ `/g/:token`（`/r/` はセラピスト別の予約リンクなので使わない）（`src/pages/public/ReservationGuide.tsx`）。予約内容・ルームの住所と地図・道順（写真のステップを自動再生）・来店時のお願い・連絡先を出す。SMSには `{guide_url}` でリンクだけ載せて通数を減らす
- トークンは `reservations.guide_token`（推測できない12文字、自動で付く）。ページのデータは RPC `get_reservation_guide(p_token)`（anon可）で、キャンセル済み・予約日の翌日を過ぎたものは返さない
- 道順は `rooms.customer_guide_steps`（[{ image_url, text }]）。ルーム管理（`/facilities/rooms`）で編集する。`entry_flow` / `entry_photos` / `key_*` はセラピスト向けの入室情報なのでお客様に出さないこと
- 来店時のお願いは `rooms.caution_text`

## SMS送信（send-sms）

- 公開鍵だけでは呼べない（料金がかかるため）。予約確定トリガー `trg_send_reservation_sms` は Vault の `send_sms_internal_secret` を `x-send-sms-secret` で付ける。管理画面はログイン中スタッフのJWT（所属店舗のSMSのみ）、他のEdge Functionは service_role
- Twilioの認証情報は Vault から読む（下記）。コードに書かないこと
- 管理権限は `user_stores.role`（owner / manager）で判定する。このプロジェクトに `user_roles` テーブルはないので、Edge Function から参照しないこと（参照すると404で500エラーになる）

## サロン経費管理（apps/salon-keihi）

- 美容サロン3店舗（ネイル・国分町サロン・アイラッシュ／アイブロー）の経費を一元管理する**独立サイト**。キャスカンの売上ダッシュボードが元。コードは `apps/salon-keihi/`（独自の package.json。Vercel は別プロジェクトでルートディレクトリ `apps/salon-keihi`）
- DBはキャスカンと同じ本番プロジェクトの `salon_*` テーブル。`store_id` / `store_isolation` の対象外で、`salon_members`（owner / staff、staff は `shop_ids` で店舗を絞れる）に登録された人だけがRLSで読み書きできる。ログインはキャスカンと同じアカウント
- 全店共通（本部）の経費は `shop_id = null`。固定費は `salon_expense_templates` を RPC `salon_post_fixed_expenses(月)` で計上（`template_id, template_month` で二重計上しない）。領収書は非公開バケット `salon-receipts`
- ビルド・テストは `apps/salon-keihi` で `npm run build` / `npm test`

## SMS（Twilio）の残高

- Twilioの認証情報は Vault の `twilio_account_sid` / `twilio_auth_token`（RPC `get_twilio_credentials()`、service_roleのみ）。Edge Functionでは `_shared/twilio.ts` の `loadTwilioCredentials()` で読む。コードに直接書かないこと
- Edge Function `sms-billing`: 管理画面（SMS画面・SMS自動送信画面）に残高と今月の使用額を出す。Twilioは送信したSMSの料金確定が遅れるので、未確定分を概算して引いた「実質残高」を表示する
- pg_cron `sms-balance-check`（毎時23分）が実質残高を確認し、1,000円を切ったらLINEで知らせる（1日1回まで。メインの `operations` → 予約通知専用の `web_booking` の順）。履歴は `sms_balance_alerts`
- 日本語のSMSは70文字（長文は67文字）ごとに1通分・約14円。テンプレート画面に通数の目安を出している（`src/lib/smsSegments.ts`）

## DBバックアップ

- Supabaseは無料プランで運用する想定（自動バックアップなし）。代わりに `.github/workflows/db-backup.yml` が毎日4:05（JST）に本番DBをダンプし、AES256で暗号化してActionsのArtifactsに30日保存する
- リポジトリは公開なので、ダンプを暗号化せずにコミット・アップロードしないこと
- Secrets: `SUPABASE_DB_URL`（Session poolerの接続文字列）/ `BACKUP_PASSPHRASE`。復元手順は `docs/db-backup.md`

## 問い合わせ集計のメール取り込み

- 電話（IVRy着信通知）とエステ魂デイリーレポート（アクセス数・問い合わせ数）は、店舗のGmailで動く Google Apps Script（`scripts/gmail-report-sync.gs`）が15分ごとに Edge Function `report-email-ingest` へ送って取り込む。Codex は使わない
- 認証は `x-ingest-token`（`report_ingest_tokens` にSHA-256で保存）。トークンはリポジトリに入れない
- 受け取ったメールと読み取り結果は `report_email_messages`。書式が読めないものは `unparsed` で残るので `parse.ts` を直す（手順: `docs/gmail-report-sync.md`）

## メンエスなうウィジェット

- 店舗トップ（EnkaHome）に、メンエスなう（men-esthe.co.jp）のタイムラインを表示する。設定は `stores.settings.menesthe_now_widget`（`{ store: PUID, type: "timeline", theme: "dark" }`、`enabled: false` で非表示）
- 公式の `<script src=".../widget-embed.js">` はページに直接置かない。管理画面と同じドメインで他社のJSが動き、ログイン情報（localStorage）に届いてしまうため、公式の iframe 版（`/widget/embed/shop/{PUID}/`）で埋め込む（`src/lib/menestheNowWidget.ts`）

## AI生成機能

- Edge Function `generate-cast-content` がカテゴリ別のAIコンテンツ生成を担当
  - `type`: profile / announcement / catchphrase / news / coupon / schedule / shop_comment / newstaff
  - Lovable AI Gateway 経由で `google/gemini-2.5-flash` を使用
