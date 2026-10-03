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

## X運用表「今日の投稿」（/hp/x-operations）

- 運用表の「1日の投稿スケジュール」の各行に、その日のデータを流し込んで投稿文を作る（`src/lib/xDailyPosts.ts`）。集客アカウントの 本日の出勤・明日の出勤・空き枠速報・セラピスト紹介・イベント・直前枠／口コミ は shifts・reservations・discounts・customer_reviews から開くたびに作り直す。求人・店長アカウントと、データが無いときは Edge Function `generate-cast-content` の `type: "x_post"`（ログイン必須）でAIが作る
- 営業日は朝6時切り替え。空き枠は公開サイトの「最短◯時〜」と同じ計算（`nextAvailableFor`）
- AIで作った文・手直しした文・「投稿した」チェックは `x_daily_posts`（store_id, post_date, account_key, slot_key）。slot_key は「時間|投稿タイプ」
- アイキャッチ画像はブラウザのcanvasで作る（`src/lib/xEyecatch.ts`、1200×675）。写真はCORSのある保存先（Supabase Storage）だけ描き、それ以外は頭文字で代わりにする

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

- 美容サロン4店舗（ネイル・国分町サロン・アイラッシュ・アイブロー。アイラッシュとアイブローは別店舗）の経費を一元管理する**独立サイト**。キャスカンの売上ダッシュボードが元。コードは `apps/salon-keihi/`（独自の package.json。Vercel は別プロジェクトでルートディレクトリ `apps/salon-keihi`）
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

## スマホ通知（管理画面をホーム画面に追加・Web Push）

- LINE通知はそのまま残し、並行してお試し中。WEB予約（booking_origin が web_form / cast_form）・お客様からのSMS返信・SMS残高不足を、管理画面を「ホーム画面に追加」した端末へプッシュ通知する
- 設定画面は `/settings/notifications`（右上の人のアイコン →「スマホ通知の設定」、サイドバーの システム → 設定 → スマホ通知）。iPhoneはホーム画面に追加したアイコンから開かないと通知を受け取れない（iOS 16.4以降）
- 管理画面を開いている間だけ `useAdminAppManifest()`（DashboardHeader）が manifest（`public/admin-app/`、名前「艶華 管理」・起動は `/admin-schedule`）を head に入れる。公開サイトには manifest を付けない
- Service Worker は `public/sw-push.js`（push と通知タップだけ。fetch は横取りしない）。端末の登録は RPC `save_push_subscription`、購読は `push_subscriptions`（topics で通知の種類を選ぶ）
- 送信は DBトリガー `trg_push_notify()` → Edge Function `push-notify`（`x-push-notify-secret` は Vault の `push_notify_internal_secret`）。購読がない店舗では呼ばない。暗号化とVAPID署名は `_shared/webPush.ts`（外部ライブラリなし）。VAPIDの鍵は Vault の `web_push_vapid_public_key` / `web_push_vapid_private_jwk`（公開鍵は `src/lib/adminPush.ts` にも載せている）
- テスト: `npm run test:push-notify`

## セラピストへの予約通知（マイページのスマホ通知に一本化）

- 予約の **確定・変更・キャンセル・担当変更** は、DBトリガー `reservations_therapist_notification` が `therapist_notifications`（通知待ち・送った記録）に積む。同じ予約の続けての変更は送る前に1件にまとめる（新規→取り消しは送らない、変更→変更は最初の変更前の値を残す）。過去の営業日の予約の手直しでは送らない
- pg_cron `therapist-notify-every-30-seconds` → `private.dispatch_therapist_notifications()`（送るものがあるときだけ）→ Edge Function `notify-therapist`（`x-therapist-notify-secret` は Vault の `therapist_notify_internal_secret`）。文面は `notify-therapist/messages.ts`（予約内容は `get_reservation_line_context`）
- 送り先は **セラピストのマイページ**（`/therapist/:token` をホーム画面に追加したアプリ「艶華 マイページ」、manifest は `public/therapist-app/`、start_url なしで本人のURLが開く）へのプッシュ通知。端末は `therapist_push_subscriptions`（マイページの「通知をオンにする」→ RPC `save_therapist_push_subscription`、トークンで本人確認）
- 端末が無い人だけ、移行中は**本人のLINEグループ**（`casts.line_group_id`）へ。**共通グループには送らない**。どちらも無い・送れない → `unreachable` / `failed` にして、管理画面の左下（`TherapistNotifyAlert`）とスマホ通知（topic `therapist_notify`）で知らせる。直接連絡して「連絡した」で消す
- 予約表の「再送」（`ReservationResendDialog`）で、お客様への予約確認SMS（`send-sms`）とセラピストへの通知（RPC `resend_therapist_notification`）を送り直せる。端末のSMSアプリを開く旧方式と `notify-line-therapist` の呼び出しはやめた
- 設定状況は `/settings/notifications` の「セラピストの予約通知（マイページ）」。未設定の人にはURLを送って設定してもらう
- テスト: `npm run test:therapist-notify`

## Claude用のブラウザ操作（jev-ultrafast）

- 外部サイトを自然文の目的で操作するときは `.claude/skills/jev-browser/SKILL.md`（`scripts/claude/jev.sh setup|check|run|stop`）。本体は作業環境の `~/.cache/jev-ultrafast` に入れる（リポジトリには入れない）
- 実行には環境変数 `TYPESAFE_API_KEY` / `TEXT_MODEL_API_KEY`（OpenRouter）が必要。クラウド環境の設定で入れる。リポジトリ・チャットに書かない
- キャスカン本体の自動化（エステ魂など）は今まで通り Browserbase。jev はアップロード・iframe 非対応

## DB停止時のメンテナンス表示

- Supabase が止まっている（未払いによる一時停止・障害でプロジェクトのドメインが引けない等）と、公開HPの出勤・空き枠が「出勤なし」に見えてしまう。`src/components/BackendDownNotice.tsx`（App全体に1つ）が `/auth/v1/health` を2回確かめ、つながらなければ「メンテナンス中・ご予約はお電話・LINEで」を出す。1分ごとに確かめ直し、戻ったら「再読み込み」を出すので、復旧後の作業は不要
- DBが読めないときの電話番号・LINEの予備値は `src/hooks/useStoreContact.tsx`（艶華の 050-1785-6945）

## 店舗の投稿先・Xの自動投稿（SNS連携管理）

- SNS連携管理（`/education?tab=sns`）の「店舗の投稿先」（`src/components/sns/StorePostChannels.tsx`）で、店舗として投稿するアカウントをまとめて管理する。X の各アカウント（運用表の shukyaku / kyujin / tencho）はキー4つ（API Key・Secret・Access Token・Secret）、その他の媒体はURL・ID・パスワード。O2 の店舗アカウントはすぐ下の既存の O2StoreAvailabilitySettings
- 表は `store_post_channels`。キー・パスワードは Vault（`store_post_channel:<id>:<項目>`）にだけ入れ、画面には「登録済み」しか返さない（RPC `get_store_post_channels` / `save_store_post_channel` / `set_store_post_channel_state` / `delete_store_post_channel` / `reveal_store_post_channel_password`（その他の媒体だけ）。X のキーは表示しない）
- 自動投稿：pg_cron `x-auto-post-every-5-minutes` → `private.dispatch_x_auto_post()`（自動投稿オンの X アカウントがあるときだけ）→ Edge Function `x-auto-post`（`x-auto-post-secret` は Vault の `x_auto_post_internal_secret`）。運用表の「決まった形の投稿」（出勤・空き枠・紹介・イベント・直前枠・口コミ）だけを時間から30分以内に出す。AIの下書きは出さない（人が確認して手動）
- 判定は `src/lib/xAutoPost.ts`、材料集めは `src/lib/xPostContext.ts`（画面と共通）、X API（OAuth 1.0a 署名）は `supabase/functions/_shared/xApi.ts`。結果は `x_daily_posts.publish_status`（posting / posted / failed / skipped）と `post_url`・`error_message`。二重投稿は RPC `claim_x_auto_post` で防ぐ
- キー無効・権限不足・上限（401/402/403/429）や3回続けての失敗で、そのアカウントの自動投稿を止める（`paused_at`）。画面の「再開」で戻す
- Edge Function は `src/lib/` のファイルを相対パスで読むので、デプロイするときは `src/lib/xPostContext.ts`・`xAutoPost.ts`・`xDailyPosts.ts`・`availability.ts`・`bookingUrl.ts`・`xOperationsPlan.ts` も一緒に送る（entrypoint は `supabase/functions/x-auto-post/index.ts`）
- テスト: `npm run test:x-auto-post`

## エスたまへの反映待ちのお知らせ

- セラピストのプロフィール変更は、まずキャスカン（HP）に保存される。エスたまへの同期ジョブ（`automation_jobs` の `estama_register_cast`）が `queued` / `waiting_for_login` のまま90秒以上残っていると、管理画面の左下に「エスたまに反映していない変更があります」を出す（`src/components/EstamaPendingAlert.tsx`、DashboardHeader に1つ）。「エスたまに反映する」で `run-queued` をログイン中スタッフの権限で実行する
- 裏の自動同期（pg_cron `estama-profile-sync-every-minute` → `/api/automations/estama-profile-worker`）は Vercel に管理鍵が無く失敗するため止めてある（active=false）。DBを直接書き換えた変更もこのお知らせから反映する

## エステ魂スカウト求人の自動化（/recruit/estama-scout）

- 毎日決まった時刻（`estama_scout_settings.propose_at`、既定11:00）に、エステ魂の「スカウト求人」（`/admin/esjob/`）と「スカウト検索」（`/admin/esjob_search/`）から候補を読み、1日 `daily_count` 人（既定10人）を選んでスマホ通知（push topic `estama_scout`）→ 画面で送る人を選んで「送る」→ エステ魂のスカウトテンプレートで自動送信。OKが出るまでは絶対に送らない
- 選び方は `src/lib/estamaScout.ts` の `selectScoutCandidates`（スカウト済み・以前に送った人・男性を除き、優先エリア〔仙台・宮城・東北など〕を先に）。テスト `npm run test:estama-scout`
- 表：`estama_scout_settings` / `estama_scout_batches`（1日1件、collecting → pending_approval → approved → sending → done）/ `estama_scout_candidates`（external_id = エステ魂の履歴書ID）
- 流れ：pg_cron `estama-scout-every-5-minutes` → `private.dispatch_estama_scout()` → Vercel `/api/cron/estama-appeal?action=estama-scout`（関数数上限のため同居。本体は `server/estama-scout.ts`）。Vercelには管理鍵を置かないので、一回限りのトークン（`estama_sync_tokens.purpose = 'estama-scout:<store_id>'`）を `claim_estama_scout_run` で実行トークンに換え、`get_estama_scout_job` / `save_estama_scout_candidates` / `mark_estama_scout_sending` / `save_estama_scout_result` / `finish_estama_scout_batch` だけで読み書きする
- 送信：小窓は `a.send-get_modal[data-row="resume,<ID>"]`（POST `/admin_post/modal/`）。`form#form-scout` の `select#mail_template` でテンプレートを選び、本文が入ったのを確かめてから `a.send-modal_post[data-post="scout"]`。返事 `["OK",…]` で送信済み、`["OUT",…]` は受け付けられず。押す直前に `mark_estama_scout_sending` で記録し、押した後に結果が分からなければ `uncertain`（重複を防ぐため再送しない）
- 画面が変わって動かなくなったら、`mode: "inspect"` / `"inspect-detail"`（読むだけ）で構造を取り直す

## AI生成機能

- Edge Function `generate-cast-content` がカテゴリ別のAIコンテンツ生成を担当
  - `type`: profile / announcement / catchphrase / news / coupon / schedule / shop_comment / newstaff
  - Lovable AI Gateway 経由で `google/gemini-2.5-flash` を使用
