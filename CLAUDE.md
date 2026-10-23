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

- **casts の権限**：ログイン中（authenticated）は表ごと（select / insert / update）なので、列を足しても grant は要らない（2026-10-19 に列ごとをやめた。艶華の管理画面はオーナー1人だけ）。公開サイト（anon）は今も**列ごと**なので、公開ページで読む列を足したら `grant select (...) on public.casts to anon` を付ける。本名・トークン・メモなどの内部情報は anon に付けない

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
- **受講状況はチェックリスト**：講習（`training_modules`）ごとのチェック項目 `checklist`（[{ id, label }]）をカリキュラム管理の「チェック項目」で足す・直す・並べ替える（`src/components/education/ModuleChecklistEditor.tsx`）。カテゴリ名は見出しの鉛筆でまとめて変え、講習ごとのカテゴリ・名前・説明は各講習の鉛筆で直す。受講状況で講習を開いてチェックをタップするとすぐ保存（`cast_training_records.checked_items`）、講習・カテゴリ・全体の％はチェックした数で出す。項目が無い講習は「受講した」1つ。`checked_items` が空（null）の昔の「完了」は100%扱い。状態（未実施・受講中・完了）はチェックの数から自動。計算は `src/lib/trainingChecklist.ts`（テスト `npm run test:training-checklist`）。実施日・担当講師・習熟度・フィードバック・改善項目の入力欄は廃止（列は残っている）

## 宣伝ノルマ（/promotion-schedule の「露出ノルマ」タブ）

- セラピストごとに、その月の**出勤日数**で媒体ごとの最低露出回数を決め、実績と比べる。媒体は HPトップバナー（新人のみ）・HPニュース・X・O2・エスたまニュース・エスたまトップバナー。画面は `src/components/promotion/PromotionQuotaBoard.tsx`、計算は `src/lib/promotionQuota.ts`（テスト `npm run test:promotion-quota`）
- 決まりは `promotion_quota_settings.config`（店長・オーナーだけ変更。無ければ既定：1〜4日 / 5〜9日 / 10〜14日 / 15日以上の4段階）。出勤日数はその月のシフト（取り消し・却下を除く）の日数
- 新人は `casts.join_date` から30日。上乗せ（HPトップバナーなど）は新人の期間がいちばん長く入っている月に1回だけ
- 実績 = `promotion_exposures`（「露出を記録」）＋ 企画（`promotion_plan_tasks` の完了した投稿。O2ストーリーはO2、宣伝先が空の古い企画は「店舗X：」などの見出しから）＋ HPニュース（`hp_articles` に名前が出た公開記事）＋ X運用表で投稿したもの（`x_daily_posts` の集客アカウント。出勤・空き枠のまとめは除く）。企画のまだ終わっていない投稿は「予定」
- 名前は絵文字・空白を無視して探す。2文字の名前は「さん・ちゃん」付きか前後が文字でないときだけ、ペア（りりか&ももか）は両方の名前でも数える
- 「今日までに足りていない露出」は月の日割り（`expectedByNow`）より少ないもの。媒体登録状況（`/education?tab=media`）にも「今月の露出」列（同じ数え方）
- 企画スケジュールは同じ画面の「企画スケジュール」タブ（`?tab=plans`）
- **企画のタスクの自動チェック**：投稿の記録から、終わった投稿タスクに自動で✓を付ける（pg_cron `promotion-task-autocheck` 15分ごと → `private.auto_check_promotion_tasks()`、画面の「投稿を確認」は RPC `run_promotion_task_autocheck`）。見る記録は、本人のO2＝マイページの同時投稿（`cast_posts`）、店舗のO2＝`manager_posts`・`o2_store_availability_posts`、店舗のX＝`x_daily_posts`、HPニュース・エスたまニュース＝`hp_articles`（その投稿日の営業日・企画のセラピストの名前入り）。根拠は `auto_source` / `auto_url`。本人のX・O2ストーリー・バナー・LINE公式は手でチェック。手で外したタスクは `auto_skip` で付け直さない。投稿日から3日過ぎて終わっていないものは `expired_at`（期限切れ。残りの数に入れない）
- タスクの種類はラベルの「：」より前で見分ける（`private.promotion_task_kind` と `src/lib/promotionTaskDraft.ts` の `promotionTaskKind`、テスト `npm run test:promotion-task`）
- **投稿文を作る**：各投稿タスクの「投稿文を作る」で、AI（`generate-cast-content` の `x_post`）がその日の出勤（休憩）・セラピストの紹介・予約URLを入れて下書きを作る。手直しして `promotion_plan_tasks.draft_text` に保存・コピー（`PromotionTaskDraftDialog`）

## X運用表「今日の投稿」（/hp/x-operations）

- 運用表の「1日の投稿スケジュール」の各行に、その日のデータを流し込んで投稿文を作る（`src/lib/xDailyPosts.ts`）。集客アカウントの 本日の出勤・明日の出勤・空き枠速報・セラピスト紹介・イベント・直前枠／口コミ は shifts・reservations・discounts・customer_reviews から開くたびに作り直す。求人・店長アカウントと、データが無いときは Edge Function `generate-cast-content` の `type: "x_post"`（ログイン必須）でAIが作る
- 営業日は朝6時切り替え。空き枠は公開サイトの「最短◯時〜」と同じ計算（`nextAvailableFor`）
- AIで作った文・手直しした文・「投稿した」チェックは `x_daily_posts`（store_id, post_date, account_key, slot_key）。slot_key は「時間|投稿タイプ」
- アイキャッチ画像はブラウザのcanvasで作る（`src/lib/xEyecatch.ts`、1200×675）。写真はCORSのある保存先（Supabase Storage）だけ描き、それ以外は頭文字で代わりにする

## ルームの名前（艶月・華月）

- 艶華のルームは2つだけ：**艶月 ＝ 二日町11-15 In-Towner**（旧：インルーム・インroom・■二日町インroom■）、**華月 ＝ 春日町11-12 ラジュール仙台**（旧：ラスルーム・ラズルーム・ラスroom）
- 昔の呼び名は同じ部屋の別名。画面は `src/lib/storeRooms.ts` の `canonicalRoomName` / `sameRoom` で比べ、DBは `public.canonical_room_name()` とトリガー（shifts / reservations / casts の room を保存時に 艶月・華月 へ）でそろえる（`20261013090000_canonical_room_names.sql`）。ルームの選択肢は `ENKA_ROOMS`
- ルーム管理の昔の行（ラズルーム・インルーム）は「過去データ」店舗のもの。艶華（tsuyaka）のルームは華月・艶月の2行だけ
- まとめて付け替えたときは、セラピストへの予約変更通知（`reservations_therapist_notification`）とエステ魂のシフト同期（`trg_enqueue_estama_shift`）を止めて行った。呼び名を直すだけの一括更新では同じようにする

## シフトの中休み（休憩）

- 出勤ごとに休憩を1つ：`shifts.break_start` / `break_end`（両方入っているときだけ有効。CHECK `shifts_break_pair`）。入力は月間シフト（`/schedule/monthly-shift`）の編集ダイアログの「中休み」欄（`src/components/shift/ShiftBreakFields.tsx`、30分・1時間のボタン）
- 休憩の時間は予約を入れない時間として扱い、準備のインターバルは足さない。計算は `src/lib/shiftBreak.ts`（`shiftBreaks` を `findNextAvailableStart` / `isAvailabilitySlotOpen` の `breaks` に渡す。朝6時前を+24時間で数える画面は出勤開始の分を第2引数に渡してそろえる）。テスト `npm run test:shift-break`
- 反映先：HPの出勤・トップの「最短◯時〜」、WEB予約の時間の選択肢と「今すぐ」、空き枠一覧、予約表（タイムラインに「☕ 休憩」、休憩にかかる予約は予約詳細に赤い注意）、O2の空き状況、X運用表の文、セラピストのマイページ（RPC `get_therapist_shift_breaks`。`get_therapist_shifts` は戻りの形を変えていない）
- DB：エステ魂の仮予約の判定（休憩にかかる希望は `outside_shift`）、セラピストアピール（`public.shift_on_break()` で休憩中の人を選ばない）。エステ魂のシフト同期は開始・終了だけ（休憩は送らない）
- Edge Function `x-auto-post` は再デプロイするときに `src/lib/shiftBreak.ts` も一緒に送る（2026年10月時点で自動投稿はオフのため、休憩対応前の版のまま）

## 新規のお客様のコース上限（セラピストごと）

- `casts.new_customer_max_minutes`（例：望月せなさんは80分）。スタッフ画面のセラピスト編集「新規のお客様のコース上限（分）」で設定。空なら制限なし
- **予約は止めない**（取りこぼさないため）。新規のお客様が上限より長いコースで予約したら知らせる：WEB予約のスマホ通知のタイトル（「⚠️ 新規80分超え：…」）、WEB予約受付のカード・予約表の予約詳細の赤い注意（RPC `get_course_limit_alerts(p_reservation_ids)`、画面は `src/lib/courseLimit.ts`）、エステ魂の仮予約の判定 `course_limit`
- 新規 = その電話番号で施術済み（completed）の予約がまだ無い人（`public.has_completed_visit`、店舗をまたいで見る）。エステ魂の「リピート予約」は新規にしない

## トップバナーのセラピスト自動ローテーション

- セラピストごとの素材：`casts.banner_images`（写真・何枚でも）・`banner_copy`（キャッチコピー40文字まで）・`banner_enabled`。スタッフ画面のセラピスト編集「トップバナーの素材」（`src/components/CastBannerAssetsEditor.tsx`、この欄だけで保存）。写真は `cast-photos` の `banner-assets/<cast_id>/`
- 公開HPのトップ（EnkaHome）で、その日に出勤する素材のある人のバナーをその場で組み立て（写真・名前・キャッチコピー・本日の出勤・最短の空き。`src/components/public/CastHeroBannerSlide.tsx`）、`stores.settings.hero_banners` の画像バナーより先に5秒ごとにローテーション。押すとそのセラピストのWEB予約
- 並び順・写真の選び方は `src/lib/castHeroBanners.ts`（新人＝入店30日を先頭、あとは日付で先頭が入れ替わる。写真も日ごとに順番。最大8枚）。テスト `npm run test:cast-hero-banners`
- 止めるときは HPトップバナー管理の「セラピストのバナー（自動）」をオフ（`stores.settings.cast_hero_banners = false`）
- バナーに出た日は露出ノルマの HPトップバナー（`promotion_exposures`）に自動で記録（pg_cron `cast-hero-banner-exposures` 毎朝6:20 → `private.record_cast_hero_banner_exposures()`）
- 並べ方は `castHeroBannersForDay`（出勤中・表示中・1人1つの出勤）。HPのトップ・`/banner-render`・エステ魂のカバー画像で同じ結果になる

### エステ魂のカバー画像も同じバナーで入れ替える

- エステ魂の店舗ページ上部のスライド＝店舗基本情報 → 店舗プロフィール（`/admin/shop/profile/edit/`）の「集客用 カバー画像」3枠（推奨1000×500、1枠目はSNSで共有したときの画像にもなる）。枠は `.upload_area` の `input#cover_N`（`admin_upload_cover_image`）にファイルを入れると幅1000pxにして仮アップロード → 「保存する」（`a.btn-default_submit`）で確定。「保存と同時に上位表示する」（`#set_up_limit`、回数制限あり）は必ず外す
- 設定はトップバナー管理（`HpTopBanners`）の「エステ魂のカバー画像（自動）」（`src/components/EstamaCoverBannersCard.tsx`）→ `stores.settings.estama_cover_banners = { enabled, slots }`（既定の枠は2・3。1枠目はお店の固定のカバー）
- 流れ：pg_cron `estama-cover-banners`（5分ごと）→ `private.dispatch_estama_cover_banners()`（朝10時以降に1日1回、毎時25〜44分は動かさない、失敗は30分あけて3回まで、「今日の分を今すぐ反映」は RPC `request_estama_cover_rotation`）→ `private.estama_scout_call(store, 'cover-banners')` → Vercel `estama-scout`（mode `cover-banners`、本体 `server/estama-cover-banners.ts`）
- 画像はHPの `/banner-render?store=&date=&cast=`（`src/pages/public/CastBannerRender.tsx`、1000×500、「最短◯時〜」なし）を Browserbase で撮る。このセッションだけ HP・Supabase・Google Fonts のドメインも許可している
- 結果は `estama_cover_rotations`（1日1行、RPC `start_estama_cover_rotation` / `finish_estama_cover_rotation`）。出た人は露出ノルマの「エスたまトップバナー」（`promotion_exposures`）に自動で記録。バナーが枠より少ない日は余った枠をそのままにする（`server/estama-cover-slots.ts`、テスト `npm run test:estama`）
- エステ魂の管理画面の作りを確かめるときは `inspect-urls` に `selectors`（要素のHTML）・`scriptKeywords`（スクリプト）を付けられる（読むだけ）

## 予約案内ページ（SMSのリンク先）

- 予約ごとの案内ページ `/g/:token`（`/r/` はセラピスト別の予約リンクなので使わない）（`src/pages/public/ReservationGuide.tsx`）。予約内容・ルームの住所と地図・道順（写真のステップを自動再生）・来店時のお願い・連絡先を出す。SMSには `{guide_url}` でリンクだけ載せて通数を減らす
- トークンは `reservations.guide_token`（推測できない12文字、自動で付く）。ページのデータは RPC `get_reservation_guide(p_token)`（anon可）で、キャンセル済み・予約日の翌日を過ぎたものは返さない
- 道順は `rooms.customer_guide_steps`（[{ image_url, text }]）。ルーム管理（`/facilities/rooms`）で編集する。`entry_flow` / `entry_photos` / `key_*` はセラピスト向けの入室情報なのでお客様に出さないこと
- 予約のルーム（`reservations.room`）が空なら、そのセラピストのその日の出勤（`shifts.room`、1つに決まるときだけ）を入れる。WEB予約・専用フォームはルームを選ばずに入るため。予約表（`/admin-schedule`）を開いたときに埋めて保存し、新規予約・編集でセラピストを選んだときも入れる（`src/lib/reservationRoom.ts`、テスト `npm run test:reservation-room`）。DBトリガー `trg_reservations_default_room`（`20261010150000_reservation_default_room.sql`）でも予約が入った瞬間に入れる
- 来店時のお願いは `rooms.caution_text`
- **ルームの注意とお客様の確認**：予約表の予約詳細に、ルームが空・ルーム管理に無い名前（案内ページに住所が出ない）・そのセラピストのその日の出勤のルームと違う、を赤で出す（`roomIssue`）。案内ページの「予約内容を確認しました」（RPC `confirm_reservation_guide(p_token)`、anon可）で `reservations.guide_confirmed_at` / `guide_confirmed_room` が入り、予約詳細に「お客様が確認済み」、予約表のタイムラインの予約の時間の横に緑の「✓確認」（確認後にルームが変わったら黄色の「再確認」）。確認の後にルームを変えたら「もう一度確認してもらって」と出す（`guideConfirmation`、`get_reservation_guide` の `confirmed_at` も空に戻る）。ルームが空の予約の案内ページは確認ボタンを出さない
- **お支払いのご案内**：カード・PayPayの予約（`reservations.payment_method`、分割払いなら `payment_details` のカード・PayPay分）だけ、手数料込みの金額・手順・決済リンクのボタンを出す。RPC の `payments`（[{ method, amount, fee, link, guide }]、画面用の整形は `src/lib/reservationGuidePayment.ts`）。リンクと手順は `payment_settings.payment_link` / `customer_guide`（1行に1つ）で、システム →「決済方法」で編集する。カードの手順はたたき台なので、決済ページの実際の表示に合わせて直す
- 予約確認SMSの `{payment_guide}` は、カード・PayPayの予約だけ「リンクを開くと決済方法の案内が出ます」になる（それ以外は行ごと消える。`send-sms/template.ts` の `paymentGuideNote`）
- PayPayの個人アカウントへの送金（ID検索）でお店の代金を受け取るのはPayPayの規約で禁止（アカウント停止のおそれ）。受け取るなら PayPay for Business の店舗用QR・決済リンクにする
- テスト: `npm run test:reservation-guide-payment`

## 無料サービス（10分・20分のサービス）

- 予約ごとに `reservations.free_service_minutes`（5〜60分）。予約表の予約フォームの「無料サービス」で なし / 🎁10分 / 🎁20分 / 🎁30分 を選ぶ。料金は変えず、施術の時間だけ延ばす
- 予約表のタイムラインは「80分＋🎁20分」でその分だけ枠を長く取り、予約詳細に「🎁 20分無料サービス付き」。HPの空き枠（`get_reservation_slots`）も無料サービスの分を埋まっている時間に入れる
- お客様：予約案内ページ（`/g/:token`、`get_reservation_guide` の `free_service_minutes`）の予約内容の先頭に目立つ枠、予約確認SMSの `{free_service}`（無料サービスの付いた予約だけ「🎁20分無料サービス付き」の行が出る）
- セラピスト：予約通知のコース名に「（＋20分無料サービス）」が付き、終わりの時間も延びる（`get_reservation_line_context`）。無料サービスだけ変えても変更として通知する
- 香山のあさんのWEB予約フォームの特典の文言は `src/lib/castBookingPromotion.ts`

## 入室方法（セラピストのマイページ）

- マイページの「入室方法」は RPC `get_therapist_entry_rooms(p_token)`（トークンで本人確認・辞めた人には返さない）で読む。`rooms` の暗証番号・入室情報・Wi-Fi は anon から直接読めない（公開しても困らない列だけ anon に grant）。出すルームは `rooms.show_in_therapist_portal`
- 鍵の開け方のアニメーション：`rooms.key_type`（`keypad` = ドアのテンキー・SwitchBot キーパッド、`dial_lock` = ダイヤル式の鍵）と `key_number`。ダイヤル式は閉めるときに戻す番号 `key_close_code`。部品は `src/components/entry/`（`KeypadUnlockAnimation` / `DialLockAnimation`）、計算は `src/lib/roomEntry.ts`
- 鍵の場所までの道順：`rooms.entry_route_steps`（[{ image_url, video_url, text, focus: { x, y, zoom } }]）。写真は focus の位置に寄って赤い丸で示し、動画は最後まで流れたら次へ。お客様向けの `customer_guide_steps` とは別
- Wi-Fi：`rooms.wifi_ssid` / `wifi_password` / `wifi_security`。マイページにカメラで読み取るとつながる QR コード（`qrcode-generator`）を出す
- 編集はルーム管理（`/facilities/rooms`）の「セラピスト向けの入室案内（マイページ）」。写真・動画は `entry-photos` バケット（表示は公開URL、アップロード・一覧はログイン中のスタッフだけ）
- 実際の暗証番号・Wi-Fi のパスワードはリポジトリ（公開）に書かないこと
- テスト: `npm run test:room-entry`

## SMS送信（send-sms）

- 公開鍵だけでは呼べない（料金がかかるため）。予約確定トリガー `trg_send_reservation_sms` は Vault の `send_sms_internal_secret` を `x-send-sms-secret` で付ける。管理画面はログイン中スタッフのJWT（所属店舗のSMSのみ）、他のEdge Functionは service_role
- Twilioの認証情報は Vault から読む（下記）。コードに書かないこと
- 管理権限は `user_stores.role`（owner / manager）で判定する。このプロジェクトに `user_roles` テーブルはないので、Edge Function から参照しないこと（参照すると404で500エラーになる）

## サロン経費管理（別リポジトリ nikotaku/salon-keihi）

- 美容サロンの経費管理サイトは**別リポジトリ `nikotaku/salon-keihi`・別のSupabase（`rvkqbxahwlzcyburvjvw`）**に独立した。Vercel は `salon-keihi-j6uh`。修正はそちらで行う
- このリポジトリの `apps/salon-keihi/` と、キャスカンのDBの `salon_*` テーブルは独立前の古いコピー（本番では使っていない）。ここを直しても経費管理サイトには反映されない

## SMS（Twilio）の残高

- Twilioの認証情報は Vault の `twilio_account_sid` / `twilio_auth_token`（RPC `get_twilio_credentials()`、service_roleのみ）。Edge Functionでは `_shared/twilio.ts` の `loadTwilioCredentials()` で読む。コードに直接書かないこと
- Edge Function `sms-billing`: 管理画面（SMS画面・SMS自動送信画面）に残高と今月の使用額を出す。Twilioは送信したSMSの料金確定が遅れるので、未確定分を概算して引いた「実質残高」を表示する
- pg_cron `sms-balance-check`（毎時23分）が実質残高を確認し、1,000円を切ったらLINEで知らせる（1日1回まで。メインの `operations` → 予約通知専用の `web_booking` の順）。履歴は `sms_balance_alerts`
- 日本語のSMSは70文字（長文は67文字）ごとに1通分・約14円。テンプレート画面に通数の目安を出している（`src/lib/smsSegments.ts`）

## サブスクの見張り（支払い管理 /payments）

- 支払い管理の「サブスクの見張り」（`src/components/payments/SubscriptionWatchPanel.tsx`）で、Supabase・IVRy・SUBLINE・Twilio・エステ魂・Vercel などの課金が止まっていないかを1時間ごとに判定し、悪くなったらスマホ通知（topic `subscription`、`subscription_alerts` → `trg_push_notify`）
- 表 `subscription_watches`（サービス・金額・請求の間隔・次の請求日・支払い方法・カードの有効期限 YYYY-MM・確認URL・請求メールの見分け・通知が何日届かなければ要確認か）。判定は `src/lib/subscriptionWatch.ts` の `evaluateWatch`（テスト `npm run test:subscription-watch`）。「支払いを確認」は RPC `mark_subscription_paid`（次の請求日を1周期すすめる）
- pg_cron `subscription-check-hourly`（毎時13分）→ `private.dispatch_subscription_check()` → Edge Function `subscription-check`（`x-subscription-check-secret` は Vault の `subscription_check_internal_secret`。画面の「今すぐ確認」はスタッフのJWT）。デプロイ時は `src/lib/subscriptionWatch.ts` と `_shared/twilio.ts` も一緒に送る
- サービスへの問い合わせ：Twilio＝アカウントの状態（suspended / closed で停止）、SUBLINE＝API（トークン登録時）、エステ魂＝管理画面の「ご契約期間」（仮予約の取り込みのたびに読んで `automation_connections.contract_until`、RPC `save_estama_contract_info`。3日前から要確認）、Supabase＝この確認が動いていること（止まると画面ごと開けない）、それ以外は確認URLが開けるか（402は停止）
- メール：Gmail の取り込み（`scripts/gmail-report-sync.gs`）で請求まわりのメールも送り、`report-email-ingest` が `classifyBillingMail` で `billing_failed`（支払い失敗・停止・カードの期限切れ）／`billing_paid`（領収書・請求書）に分ける。送り元のドメイン（`SERVICE_PRESETS.senders`）か登録したキーワードでサブスクと結びつける。IVRy は着信通知が `silence_days` 日届かなければ要確認
- **Gmail の取り込みは2026年10月時点で未設定**（`report_email_messages` が0件）。設定するまでメールでの判定と IVRy の形跡の判定は動かない（画面に注意を出している）。スクリプトを貼り直すと請求メールも送るようになる
- カード番号・パスワードは入れない（支払い方法は「Visa 下4桁」まで）

## DBバックアップ

- Supabaseは無料プランで運用する想定（自動バックアップなし）。代わりに `.github/workflows/db-backup.yml` が毎日4:05（JST）に本番DBをダンプし、AES256で暗号化してActionsのArtifactsに30日保存する
- リポジトリは公開なので、ダンプを暗号化せずにコミット・アップロードしないこと
- Secrets: `SUPABASE_DB_URL`（Session poolerの接続文字列）/ `BACKUP_PASSPHRASE`。復元手順は `docs/db-backup.md`

## 電話（SUBLINE）

- 店の電話はIVRyから SUBLINE（050番号アプリ、株式会社インターパーク）に乗り換え。設定は `/settings/phone`（`src/pages/PhoneSettings.tsx`、サイドバーの システム → 設定 → 電話（SUBLINE））
- SUBLINEは汎用のAPIを公開していない（ヘルプ「SUBLINEでできないこと」）。使えるのは公式kintoneプラグインと同じ2つだけ：`GET https://api.subline.jp/v1/setting/member/`（メンバー・050番号・外部連携オンなら device_id）と `POST /v1/push-call/`（そのメンバーのスマホへ発信の通知）。認証はヘッダー `x-subline-token`（SUBLINE管理画面「外部連携管理 › API設定」のアクセストークン）
- **着信・通話履歴を外に知らせる仕組みは無い**ので、SUBLINEだけでは着信ポップ・電話の問い合わせ件数の自動集計はできない
- アクセストークンは Vault（`subline_token:<store_id>`）。登録は画面から RPC `save_subline_token`（店長・オーナー）、やめるときは `clear_subline_token`（値を空にする。空は未登録扱い）。画面には「登録済み」だけ（`get_subline_settings`）。トークンをリポジトリ・チャットに書かないこと
- Edge Function `subline`（ログイン中スタッフのJWT・所属店舗だけ）：`members`（接続確認、店長・オーナー）/ `call`（パソコンから発信 → `subline_settings.member_account_code` のスマホへ通知）。処理は `supabase/functions/subline/sublineApi.ts`
- 管理画面の電話番号は `PhoneCallLink`（`src/components/phone/PhoneCallLink.tsx`）。登録済みの店舗では、スマホは `subline://?number=<番号>` でSUBLINEアプリを開き、パソコンは通知を送る。未登録なら今まで通り `tel:`
- 接続確認の画面から「この番号をHPの電話番号にする」で `store_info.phone`（HP・Xの投稿文の番号）を切り替える
- テスト: `npm run test:subline`

## 着信ポップ（CTI・Twilio）

- お客様の着信で、管理画面の右下に顧客データ（ランク・来店・前回の担当・NG・好み・最近の来店）のポップを出す（`src/components/CtiCallPopup.tsx`、DashboardHeader に1つ）。「予約を入力」で `/admin-schedule?call=<番号>` → 新規予約が電話番号入りで開き、予約フォームがお客様の情報を出す（`src/lib/incomingCall.ts`）
- 着信の記録は Twilio の番号の Voice Webhook → Edge Function `cti-incoming` → RPC `cti_log_incoming`（service_role のみ）→ `cti_calls`（Realtime）。店舗はかかってきた番号（To）が `store_info.phone` か `stores.settings.cti_number` と同じ店舗（無ければ既定店舗）。`cti_calls` は store_isolation で他店から見えない
- 転送先は Edge Function の環境変数 `CTI_FORWARD_NUMBER`（E.164）。SUBLINEには着信を知らせる仕組みが無いので、自動ポップを使うには Twilio の番号を表に出し、SUBLINEの050番号へ転送する形になる（2026年10月時点で未稼働）

## 問い合わせ集計のメール取り込み

- 電話（IVRy着信通知）とエステ魂デイリーレポート（アクセス数・問い合わせ数）は、店舗のGmailで動く Google Apps Script（`scripts/gmail-report-sync.gs`）が1分ごとに Edge Function `report-email-ingest` へ送って取り込む（一度送ったメールは6時間送り直さない）。Codex は使わない
- エステ魂の仮予約のメール（`estama_reservation`）か、IVRyの 0120-286-634 の着信通知が届いたら、RPC `request_estama_reserve_sync` → すぐにエステ魂の「お店への予約」を読みに行く（下の「エステ魂の仮予約の取り込み」）
- 認証は `x-ingest-token`（`report_ingest_tokens` にSHA-256で保存）。トークンはリポジトリに入れない
- 受け取ったメールと読み取り結果は `report_email_messages`。書式が読めないものは `unparsed` で残るので `parse.ts` を直す（手順: `docs/gmail-report-sync.md`）

## メンエスなうウィジェット

- 店舗トップ（EnkaHome）に、メンエスなう（men-esthe.co.jp）のタイムラインを表示する。設定は `stores.settings.menesthe_now_widget`（`{ store: PUID, type: "timeline", theme: "dark" }`、`enabled: false` で非表示）
- 公式の `<script src=".../widget-embed.js">` はページに直接置かない。管理画面と同じドメインで他社のJSが動き、ログイン情報（localStorage）に届いてしまうため、公式の iframe 版（`/widget/embed/shop/{PUID}/`）で埋め込む（`src/lib/menestheNowWidget.ts`）
- 店舗管理画面（`/manage/store/6490/`）への同時投稿は準備中。サイトは日本以外のIPから開けない（404・Cloudflare）ので、Browserbase の日本のプロキシ（`createBrowserSession` の `proxyCountry: "JP"`）で開く。まず SNS連携管理 →「店舗の投稿先 › その他の媒体」にメンエスなう（ログイン画面のURLが men-esthe.co.jp）を登録し、「管理画面を調べる（日本経由）」で画面の構成（メニュー・フォームの項目・スクリーンショット）を読む（`/api/automations/estama` の `action: "menesnow-inspect"`、本体 `server/menesnow-inspect.ts`、読むだけ）。テスト `npm run test:menesnow`

## スマホ通知（管理画面をホーム画面に追加・Web Push）

- LINE通知はそのまま残し、並行してお試し中。WEB予約（booking_origin が web_form / cast_form）・お客様からのSMS返信・SMS残高不足・セラピストの精算入力（マイページの `/therapist/:token/checkout` → `daily_sales_records` が pending で入った・送り直された、topic `daily_sales`。タップで清算明細を開いて承認、下記「精算の承認」）を、管理画面を「ホーム画面に追加」した端末へプッシュ通知する
- 設定画面は `/settings/notifications`（右上の人のアイコン →「スマホ通知の設定」、サイドバーの システム → 設定 → スマホ通知）。iPhoneはホーム画面に追加したアイコンから開かないと通知を受け取れない（iOS 16.4以降）
- 管理画面を開いている間だけ `useAdminAppManifest()`（DashboardHeader）が manifest（`public/admin-app/`、名前「艶華 管理」・起動は `/admin-schedule`）を head に入れる。公開サイトには manifest を付けない
- Service Worker は `public/sw-push.js`（push と通知タップだけ。fetch は横取りしない）。端末の登録は RPC `save_push_subscription`、購読は `push_subscriptions`（topics で通知の種類を選ぶ）
- 送信は DBトリガー `trg_push_notify()` → Edge Function `push-notify`（`x-push-notify-secret` は Vault の `push_notify_internal_secret`）。購読がない店舗では呼ばない。暗号化とVAPID署名は `_shared/webPush.ts`（外部ライブラリなし）。VAPIDの鍵は Vault の `web_push_vapid_public_key` / `web_push_vapid_private_jwk`（公開鍵は `src/lib/adminPush.ts` にも載せている）
- テスト: `npm run test:push-notify`

## 公式LINEの見張り・自動応答（LINE対応 /line-inbox）

- お客様用の公式LINE（艶華は @423clcez、`store_info.line_url`）に届いたメッセージを記録して管理画面アプリへスマホ通知（topic `line_inbox`）し、決めた時間（既定5分）のうちにスタッフが返信・「対応済み」にしなければ、AI（Claude、`claude-sonnet-5-5`）が一次対応の返事を送る。返事の最後に「（自動応答）スタッフが確認でき次第…」を付ける。予約の確定・空きの約束・住所の詳細はAIに言わせない（プロンプトは `supabase/functions/_shared/lineCustomerReply.ts`）
- **LINE公式アカウントのアプリ（チャット）で手で返信したことはAPIで分からない**。アプリで返したら「LINE対応」で「対応済み」を押す。管理画面から返信すると自動で対応済みになる（AIの下書きボタンあり）
- つなぎ方：「LINE対応」の「設定」（店長・オーナー）でチャネルID・チャネルシークレット（Vault `line_customer_channel:<store_id>`）を保存 → 出てくる Webhook URL（`line-customer-webhook?k=<line_customer_settings.webhook_key>`）を LINE Developers に貼り Webhook オン → Official Account Manager の応答設定で チャット・Webhook ともオン。トークンは Channel ID / secret から15分のステートレストークンを都度発行（長期トークンは発行し直さない）
- 表：`line_customer_settings` / `line_customer_threads`（status: waiting → replying → auto_replied / handled / failed）/ `line_customer_messages`（direction: in / staff / ai）。RPC `record_line_customer_message` / `claim_line_auto_reply`（二重送信防止）/ `finish_line_customer_reply` / `mark_line_thread_handled`
- 流れ：Webhook → `line-customer-webhook` が記録（返事はしない）→ DBトリガー `trg_push_notify` → push-notify。pg_cron `line-customer-auto-reply-every-minute` → `private.dispatch_line_auto_replies()`（時間を過ぎた返事待ちがあるときだけ。12時間より古いものは対象外）→ Edge Function `line-customer-reply`（`x-line-customer-secret` は Vault の `line_customer_internal_secret`）。送れなかったら failed にしてスマホ通知
- AIに渡す事実：店舗情報・コース料金（`get_public_back_rates`）・指名料・オプション・今日と明日の出勤。設定の「AIへの追加の指示」で足せる。Anthropic の鍵は既存の Edge Function Secret `ANTHROPIC_API_KEY`
- 自動応答はプッシュメッセージなので、LINE公式アカウントの月の送信数（無料枠）を使う
- テスト: `npm run test:line-customer`

## セラピストへの予約通知（マイページのスマホ通知に一本化）

- 予約の **確定・変更・キャンセル・担当変更** は、DBトリガー `reservations_therapist_notification` が `therapist_notifications`（通知待ち・送った記録）に積む。同じ予約の続けての変更は送る前に1件にまとめる（新規→取り消しは送らない、変更→変更は最初の変更前の値を残す）。過去の営業日の予約の手直しでは送らない
- pg_cron `therapist-notify-every-30-seconds` → `private.dispatch_therapist_notifications()`（送るものがあるときだけ）→ Edge Function `notify-therapist`（`x-therapist-notify-secret` は Vault の `therapist_notify_internal_secret`）。文面は `notify-therapist/messages.ts`（予約内容は `get_reservation_line_context`）
- **通知の中身は1つにそろえる**：プッシュ通知もLINEも同じ `reservationDetailLines`（`notify-line-therapist/reservationLineNotification.ts`）で、日付・**開始時刻**（「⏰ 開始 20:30（20:30〜21:50）」）・コース・担当・金額・**割引**（「🏷️ 割引：−2,000円（クーポン名）」／なし）・**決済方法**（現金／カード／PayPay、分割は「カード 10,000円＋現金 9,000円」）・**決済状況**（`reservations.payment_status`。決済済み／未決済（当日現金でお受け取り・お店が決済を確認））・来店区分・指名・オプション・ルーム・お客様・備考を必ず載せる。変更の通知は「・変更点」＋「【変更後の予約内容】」＋同じ中身。割引・決済方法・決済状況の変更も「変更」として送る
- 決済状況は予約表の予約詳細「決済状況」の「決済済みにする／未決済に戻す」で変える（変えるとセラピストに変更として知らせる）
- 送り先は **セラピストのマイページ**（`/therapist/:token` をホーム画面に追加したアプリ「艶華 マイページ」、manifest は `public/therapist-app/`、start_url なしで本人のURLが開く）へのプッシュ通知。端末は `therapist_push_subscriptions`（マイページの「通知をオンにする」→ RPC `save_therapist_push_subscription`、トークンで本人確認）
- 端末が無い人だけ、移行中は**本人のLINEグループ**（`casts.line_group_id`）へ。**共通グループには送らない**。どちらも無い・送れない → `unreachable` / `failed` にして、管理画面の左下（`TherapistNotifyAlert`）とスマホ通知（topic `therapist_notify`）で知らせる。直接連絡して「連絡した」で消す
- 予約表の「再送」（`ReservationResendDialog`）で、お客様への予約確認SMS（`send-sms`）とセラピストへの通知（RPC `resend_therapist_notification`）を送り直せる。端末のSMSアプリを開く旧方式と `notify-line-therapist` の呼び出しはやめた
- 設定状況は `/settings/notifications` の「セラピストの予約通知（マイページ）」。未設定の人にはURLを送って設定してもらう
- **完了の判断**：ホーム画面に追加したアプリ（`therapist_push_subscriptions.standalone`）で通知をオンにし、テスト通知を受け取った（通知をタップ＝ `?push_test=1` で開く、またはカードの「届いた」→ RPC `confirm_therapist_push_test` → `test_confirmed_at`）ら完了。`/education?tab=media`（SNS・媒体登録の完了状況）の「マイページ」列（ホーム画面・通知／テスト通知）に自動で✓が付く（`src/lib/mediaRegistration.ts` の `portal_app` / `portal_test`）
- テスト: `npm run test:therapist-notify`

## セラピストのSNSアカウント（X・O2）の受け渡し

- お店が作った X・O2 のログインID・パスワード（`cast_site_credentials`、管理画面の SNS連携 `/education?tab=sns` で保存）を、セラピストのマイページのメニュー「SNSアカウント」（`?view=sns`）で本人が見られる。RPC `get_therapist_sns_account(p_token)`（anon可・トークンで本人確認）。画面は `src/components/therapist/TherapistSnsAccount.tsx`、例文・データは `src/lib/therapistSns.ts`
- SNS連携の各セラピストの「設定完了を通知」（一覧と「設定」画面の「セラピストに知らせる」。XかO2を登録して保存したときのお知らせの「セラピストに通知」からも）→ RPC `notify_therapist_sns_ready(p_cast_id)` → `therapist_notifications`（kind = `sns_ready`）。届け方は予約通知と同じ（マイページのプッシュ → 本人のLINEグループ → 届かなければ管理画面の左下）。通知日時と「確認済み」は `therapist_sns_setup_notices`（マイページで開くと `mark_therapist_sns_setup_seen`）
- 設定マニュアルは画像4枚（`public/therapist-guide/sns-setup-*.png`：Xのトップ・O2のトップ・自己紹介（BIO）・初回ポスト）。艶華向けの文面。マイページの例文（BIO・初回ポスト）には本人の名前と専用予約リンクが入る

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
- Edge Function は `src/lib/` のファイルを相対パスで読むので、デプロイするときは `src/lib/xPostContext.ts`・`xAutoPost.ts`・`xDailyPosts.ts`・`availability.ts`・`bookingUrl.ts`・`xOperationsPlan.ts`・`shiftBreak.ts` も一緒に送る（entrypoint は `supabase/functions/x-auto-post/index.ts`）
- テスト: `npm run test:x-auto-post`

## エスたまへの反映（バックグラウンド）

- セラピストのプロフィール変更は、まずキャスカン（HP）に保存される。エスたまへの同期ジョブ（`automation_jobs` の `estama_register_cast`）は、**管理画面を開いていなくても裏で反映する**
  - pg_cron `estama-profile-sync-every-minute` → `private.dispatch_estama_profile_sync()` → Vercel `/api/automations/estama-profile-worker`（一回限りのトークン＋ Vercel の環境変数 `SUPABASE_SECRET_KEY`）。毎時27〜42分は空き枠更新のため動かさない
  - Vercel に鍵が無い・ワーカーが失敗したときは、ディスパッチャーが15分あけて再試行する
- 予備：スタッフ画面で保存したときは `run-profile-sync` を `background: true` で呼ぶ（`startEstamaProfileSync`、Vercel の `waitUntil` で画面を閉じても続く）。反映待ちが3分以上残っていれば、管理画面の `EstamaPendingAlert` が `run-queued`（`jobType: estama_register_cast`, `background: true`）を呼ぶ（同じ端末からは60秒に1回まで、1回で2件まで、実行中があれば何もしない）
- 左下には「自動で反映しています」「ログイン切れ（再ログインが必要）」「反映できなかった変更（もう一度反映する）」だけを出す
- **作業が終わった画面のスクリーンショット**：`processAvailableJobs` で処理した作業（プロフィール同期・シフト同期・照合）は、終わった（失敗した）画面を非公開バケット `estama-job-screenshots`（`<store_id>/<job_id>.jpg`、プロフィールはページ全体）に保存し、`automation_jobs.screenshot_path` に記録する。「エスたま自動化履歴」（`/schedule/estama-sync-history`）の「プロフィール同期の履歴」（`src/components/EstamaProfileSyncHistory.tsx`）で見られる。30日より古いものはワーカーが時々消す。トークン方式のシフト同期（`estama-worker`）は従来どおり公開ページの確認画像を `estama_sync_reports` に残す
- **既存のセラピストの更新**は、エステ魂のID（`external_cast_profiles.external_cast_id`）の編集画面を開き、名前が入っている（＝その人の画面）ことを確かめてから保存する（`server/estama-cast-editor.ts`）。`/admin/cast_edit/`（IDなし）は**新規登録の画面**なので更新に使わない（2026年10月まで、この画面で保存していたため変更が反映されていなかった）。保存後は編集画面を開き直してSNS欄を確かめ、違えば失敗にする。まだつながっていない人も、公開の在籍一覧に同じ名前が1人いればその人を更新する（二重登録しない）
- `payload.fields = "sns"` のジョブはブログ・SNS欄だけを直す（写真・紹介文はエステ魂のまま）
- プロフィールの「ブログ・SNS」欄：**X(旧Twitter)＝SNS運用管理のXのプロフィールURL**（`casts.x_account` を `https://x.com/ID` に直して送る）、**外部ブログ＝O2のプロフィールURL**（`casts.o2_url`、O2が無い人だけ `blog_url`）。変換は `server/estama-sns-links.ts`。`o2_url` の変更でも同期が積まれる（トリガー `trg_enqueue_estama_cast_update`）

## エステ魂の「ご案内状況（今すぐ）」の自動更新

- pg_cron `estama-availability-hourly`（毎時40分）→ `private.dispatch_estama_availability_refresh()` → Vercel `/api/cron/estama-availability`。エステ魂の「ご案内状況」画面で、エステ魂に載っている勤務時間の中にいる人を「今すぐ」にする（手で別の状態にした人はそのまま）。表示は1時間で切れる。結果は `estama_sync_reports`（「ご案内状況」）
- 毎時だけだと出勤の開始から最大1時間近く「今すぐ」が出ないので、pg_cron `estama-availability-on-shift-start`（5分ごと）→ `private.dispatch_estama_availability_on_shift_start()` が、出勤の開始・休憩明けから20分以内でまだ更新していなければ同じ更新をかける（毎時27〜42分は動かさない）
- 出勤者がいない時間は「現在勤務中のセラピストがいないため更新対象なし」で正常（止まっているわけではない）

## エステ魂の仮予約の取り込み（WEB予約受付 /schedule/web-bookings）

- エステ魂の仮予約は、管理画面「お店への予約」（`/admin/reserve/`）にお客様名・電話・希望日時・指名・コース・クーポン・ご要望がそろって出る（IVRyの自動音声の電話をコピペする必要はない）。pg_cron `estama-reserve-sync`（毎分確認。仮予約のメールの合図（`private.estama_reserve_sync_requests`）があればすぐ、無ければ定期の 2,7,12,17,22,47,52,57分だけ。定期分は朝4〜9時は休み・毎時27〜42分の空き枠更新とは重ならない。別のエスたま処理中で読めなければ、合図が消えるまで毎分やり直す）→ `private.dispatch_estama_reserve_sync()` → `private.estama_scout_call(store, 'reserve-sync')` → Vercel `/api/cron/estama-appeal?action=estama-scout`（mode `reserve-sync`、本体 `server/estama-reserve-sync.ts`）が1ページ目（受付の新しい順20件）を**読むだけ**
- 文字の読み取りは `server/estama-reserve-parse.ts`（テスト `npm run test:estama-reserve`。テストに実在のお客様の情報を書かない）。保存と判定は RPC `save_estama_reservation_requests(p_run_token, p_items)`（スカウトと同じ一回限りの実行トークン）→ `estama_reservation_requests`（anon は読めない）
- **HPの出勤が正しい前提で判定**（`private.check_estama_request`）：`dummy`（`casts.is_estama_dummy` のダミー宛て）/ `unknown_cast`（HPにいない名前）/ `no_shift`（その営業日にHPの出勤なし）/ `outside_shift`（出勤の時間外）/ `overlap`（同じ子の別の予約と重なる）/ `free`（指名なし。その時間の出勤人数）/ `ok`。名前は年齢・絵文字・空白を除いて照合（`private.norm_cast_name`）。営業日は朝6時切り替え
- 予約表に同じ電話番号・前後60分の予約があれば自動で「登録済み」（手で入れた分と二重にならない）。**自動では予約を作らない**（確定SMS・セラピスト通知が仮予約のまま飛ばないように）。WEB予約受付（左：ホームページからのWEB予約／右：エステ魂からの仮予約。スマホでは縦に並ぶ）の「予約表に登録」で `/admin-schedule?estama=<id>` が開き、内容（深夜は前日の25時台）・メモ（コース・クーポン・ご要望）が入った新規予約を確認して保存 → `set_estama_reservation_request` で結びつく。ダミー・いない名前はセラピストを空にして開く
- 「予約表に登録」では全部入った状態で開く：お客様・日時・セラピストに加え、コース（エステ魂の料金と同じ料金のコース。「【会員限定】…プラン」は「エスたま限定」）・指名（指名料が同じもの、ネット指名優先。同じセラピストに施術済みのお客様は本指名）・オプション（`option_label` の名前で当てる）・クーポン（割引の名前が書いてあるもの）。料金は予約入力が計算する。当てはめられなかったものはメモに「※自動で入れられなかった項目」と残す（`src/lib/estamaReservationRequests.ts` の `catalogPrefill`、テスト `npm run test:estama-reserve`）
- 新しい仮予約（受付から1時間以内）はスマホ通知（topic `web_booking`、push-notify の `estama_reserve`）。店舗の `stores.settings.estama_reserve_sync = false` で止められる
- 画面の作りを確かめるときは mode `inspect-urls`（`paths: ["/admin/reserve/"]`、読むだけ）

## エステ魂の自動再ログイン

- エステ魂の管理画面のログイン（Browserbase に保存したブラウザ状態）は2か月ほどで切れる（2026年10月：8/8にログイン → 10/8に切れて、空き枠の更新・今すぐご案内・同期が2日止まった）
- 切れると `automation_connections.status = 'expired'`（「ログイン画面を開く」を押したまま15分以上 `login_in_progress` のものも対象）。pg_cron `estama-relogin-every-5-minutes` → `private.dispatch_estama_relogin()` → Vercel `/api/cron/estama-appeal?action=estama-relogin`（関数数上限のため同居。本体は `server/estama-relogin.ts`）が、登録されたメールアドレス・パスワードで店舗ログイン画面（`/login/`、`#form-login_shop`）からログインし直し、`ready` に戻して「ログイン待ち」の作業を再開する。失敗が続いたら間をあける（1・2回目は10分、3回目以降は6時間）
- ログイン情報は Vault の `estama_admin_login:<store_id>`（{mail, password}）だけ。登録は エスたま自動化の画面（スタッフ画面 → エスたま自動化、`EstamaAutoReloginSettings`）から RPC `save_estama_admin_login`（店長・オーナー）、画面には「登録済み」とメールの一部だけ（`get_estama_admin_login_status`）。ワーカーは一回限りのトークン（`estama_sync_tokens.purpose = 'estama-relogin:<store_id>'`）を `claim_estama_relogin_run` で換えて受け取り、`finish_estama_relogin_run` で結果を返す。パスワードをログ・結果・リポジトリ・チャットに出さないこと
- 3回続けて失敗・ログイン情報が未登録 → `estama_login_alerts` → スマホ通知（topic `estama_login`、タップで `/staff?estama=login`）。状態は `private.estama_relogin_state`
- テスト: `npm run test:estama`（`tests/estamaRelogin.test.ts`）

## 日別精算の雑費・宿泊費の自動入力（/sales/daily-sales）

- その日の精算をまだ保存していないセラピストは、雑費を「1本¥1,000・1日¥2,000まで」（給与画面の雑費と同じ決まり）、出稼ぎ（`casts.tags` に「出稼ぎ」）の人は宿泊費を「1日¥2,000」で自動で入れる。保存済み・手で直した金額はそのまま。計算は `src/lib/clearanceDefaults.ts`（テスト `npm run test:clearance-defaults`）

## 精算の承認（清算明細をLINEで送る代わり）

- セラピストがマイページで精算（売上）を送る → 管理画面アプリにスマホ通知（topic `daily_sales`）。タップすると `/sales/daily-sales?date=…&cast=…` でその人の**清算明細の画像**（`SettlementReceiptDialog`）が開き、「金額を承認」を押すだけ。各セラピストの欄のボタンも「明細を見て金額を承認」
- 承認 = 既存の `complete_daily_clearance`（清算の保存・予約の完了）のあとに RPC `approve_daily_settlement`（給与・現金預かり・不足分・明細を `settlement_approvals` に記録し、`therapist_notifications`（kind = `settlement`）でマイページへ知らせる）。明細の画像は `src/lib/clearanceReceipt.ts` の `renderClearanceReceipt`（管理画面とマイページで同じ絵。承認時の中身を `receipt` に保存し `fromReceiptSnapshot` で描き直す）
- **不足分** = 給与 − 現金預かり（カード・PayPayが多い日に出る。お店があとで払う）。マイページに「精算が承認されました。不足分 ¥X は、振込もしくは次回出勤日の相殺になります」と出て、本人が「振込」か「次回出勤日に相殺」を選ぶ（`choose_therapist_shortage_method`）。振込なら「振込先入力はこちら」→ `cast_bank_accounts`（`save_therapist_bank_account`、口座番号は7桁にそろえる・名義はカタカナ。マイページには末尾4桁だけ返す）
- 振込を選んで振込先がそろったら管理画面アプリに知らせる（push-notify の `settlement_transfer`、通知の種類は精算と同じ `daily_sales`）。日別精算の上の「まだ払っていない給与の不足分」で口座を見て振り込み、「振込済みにする」（`mark_settlement_shortage_paid`）
- 「振込済みにする」を押すと、セラピストのマイページへ「💴 不足分 ¥X を振り込みました」を送る（`therapist_notifications` の kind = `settlement`・`snapshot.event = shortage_paid`。取り消すとまだ送っていない知らせは止める）
- 「次回出勤日に相殺」は、次の精算に「前回の不足分（M/D）」として給与調整に自動で入り（`source_clearance_id` 付き）、その精算を承認すると相殺済みになる
- マイページの通知は届かなくても管理画面には知らせない（マイページを開けば `TherapistSettlementNotice` に出る）。画面・計算は `src/lib/settlementApproval.ts`（テスト `npm run test:clearance-defaults`）・`settlementAdmin.ts`・`therapistSettlement.ts`
- **追加支給と給与不足分の相殺は分ける**（`daily_clearances.other_expenses` の `kind`）：`salary_addition` = 追加支給（講習手当・本指名バックなど。給与として経費に入る）、`shortage_offset` = 前回までの給与不足分を今回の現金で払った分（不足が出た日の給与に入っているので、月別清算の給与合計・純利益には入れない。今回の受け取り・投函額にだけ効く）。日別精算の「追加支給」「不足分の相殺」ボタンで入れ、行の左のラベルで切り替え。自動で入る「前回の不足分（M/D）」は相殺。分け方は `src/lib/clearanceExtraItems.ts` の `splitSalaryAdjustments`
- **支払い管理（/payments）の「セラピストの給与不足分」**：まだ払っていない不足分（`settlement_approvals.shortage_amount > 0` で `shortage_settled_at` が空）を月に関係なく全部ためて出す。状態は 未振込（振込を選んだ）／相殺待ち（次の出勤日の精算で自動）／受け取り方 未選択。払ったものはその月の分だけ。上の「給与不足分 未払い」の件数とアラートの帯
- 手で入れた「不足分の相殺」の行（元の清算を指していない）は、承認のときにそのセラピストのまだ払っていない不足分に古い順に当てて相殺済みにする（`offsetClearanceIds` の第2引数）
- 月別清算では、日別精算から経費に入る交通費（`expenses` の「日別清算より…」）を経費から外す（給与の交通費として数えているため）
- `daily_clearances` は昔から anon に全部開いているので、明細（お客様名）・不足分・口座は anon が読めない `settlement_approvals` / `cast_bank_accounts` に分けている。新しい列を `daily_clearances` に足さないこと

## セラピストの登録（源氏名が未定でも本名だけで）・プロフィールの入力率

- スタッフ画面の新規追加は、源氏名か本名のどちらかがあれば登録できる。源氏名が空なら `casts.name = '源氏名未定'`（本名は name に入れない。casts の name は anon から読めるため）
- 源氏名が未定の間は DBトリガー `trg_casts_pending_stage_name` が `is_visible = false`・`estama_auto_register = false` にそろえる（HPに出さない・エステ魂に登録しない）。源氏名が決まったら名前を入れて、HPの表示とエスたま自動登録をオンにする
- スタッフ画面のカードは源氏名未定なら本名＋「源氏名未定」バッジ、名前の下に「プロフィール ◯%」（バーと未入力の項目）。項目と判定は `src/lib/castProfileCompletion.ts`（テスト `npm run test:cast-profile`）
- 本名・生年月日・メモ・面接シートなどの内部情報の列は anon から読めない（`20261017150000_cast_pending_stage_name.sql` で revoke）。公開ページで casts の列を足すときは anon に grant されているか確かめる
- **仮登録**：キャスト管理の「＋新規追加」は短い画面（本名・源氏名（任意）・入店日・ルーム）。「仮登録する」か「登録して続きを入力」（そのまま編集の「未入力」タブが開く）。AIメモ・エスたまからの取り込みで入った項目も一緒に保存する
- **編集画面のタブ**：未入力（足りない項目だけ。`src/components/staff/CastMissingFields.tsx`）／基本／インタビュー／写真／コメント／管理。「保存する」は下に固定でどのタブからでも押せる。カードの「プロフィール ◯%」を押すと「未入力」タブで開く
- **写真タブ**：アップロードは「写真を追加」1か所。各写真の「HP表示」トグルでHPに出すか選ぶ（オン＝`casts.photos`・最大6枚・番号順で①がメイン＝`photo`、オフ＝`casts.management_photos`・非公開）。新しく入れた写真は非公開に入る（HP表示が0枚のときだけ1枚目をオン）。レベル・ステータス・URLコピー・アーカイブ・削除は「管理」タブ（エスたまは自動同期なので手動ボタンは置かない）。セラピストレベル（ビギナーズ〜マスター）とカスタムタグは廃止（`casts.tags` のデータは残っている。出稼ぎなどのステータスは今も tags）
- 編集画面は `casts_admin_safe`（access_token・O2のパスワードを除いたビュー）から読む。**casts に列を足したらこのビューにも足す**（ビューは security_invoker。今は authenticated が casts を表ごと読めるので権限の付け忘れは起きない）（足さないと編集画面で空に見え、保存で消える。2026年10月に `new_customer_max_minutes`・バナーの列が抜けていたのを `20261018093000_casts_admin_safe_new_columns.sql` で直した）
- **本人のプロフィール入力**：マイページのメニュー「プロフィール入力」（`?view=profile`、`src/components/therapist/TherapistProfileForm.tsx`）でインタビューの項目を入れて「お店に送る」→ `cast_profile_submissions`（status: pending → applied / rejected、RPC `get_therapist_profile_form` / `submit_therapist_profile`、本人のトークン・項目は `therapist_profile_field_keys()` だけ）。キャスト管理の上の「📝 セラピストから届いたプロフィール」で変わる項目を見比べて「反映する」（casts に入る。カップは bust_size、コメントは profile、3サイズは body_size もそろえる）。「未入力」タブの「本人に入力してもらう」で入力用URLをコピー。項目と変換は `src/lib/therapistProfileForm.ts`（テスト `npm run test:cast-profile`）
- **写真の加工**：写真タブの各写真の「加工」で、切り抜き（元のまま／正方形／縦3:4／縦9:16／横4:3）・ズームと位置・回転・左右反転・明るさ／コントラスト／鮮やかさ・顔隠し（白ぼかし＝白くふんわり＋キラキラの粒／白いハート／モザイク。置いたものはドラッグで動かせる。粒の並びは置いたときの `seed` で固定）・背景のモザイク／ぼかし（残す人を楕円でなぞって囲む。ふちはなめらかにつなぐ）ができる（`src/components/staff/PhotoEditorDialog.tsx`、計算は `src/lib/photoEditor.ts`、テスト `npm run test:photo-editor`）。ブラウザの canvas だけで描く（Safari は ctx.filter が使えないので色は画素を直接いじる）。加工した写真は `cast-photos/management-photos/` に新しいファイルで保存して同じ場所に差し替え、元のファイルは消さない。保存先が外部（Googleドライブ等）の写真は CORS で読めず加工できない
- **本人の画像アップロード**：マイページのメニュー「画像アップロード」（`src/components/therapist/TherapistPhotoUpload.tsx`）で写真を何枚でも送れる（1人60枚まで・長い辺2000pxのJPEGにして送る）。Edge Function `therapist-photos`（verify_jwt なし・本人のトークンで確認、list / upload / remove）が `cast-photos` の `therapist-uploads/<cast_id>/` に置き、`casts.management_photos`（非公開）に足す。HPに出すかはお店が編集画面の写真タブの「HP表示」で選ぶ。本人が消せるのはHPに出ていない自分の写真だけ。マイページの「外部サイト登録・連携」欄は廃止

## お客様へのキャッシュバック・返金（精算の入れ忘れ防止）

- 起きた予約に記録する：予約表の予約詳細「💴 キャッシュバック・返金」（`src/components/ReservationCashReturns.tsx`）か、セラピストのマイページの精算「お客様に返したお金」（`src/components/therapist/TherapistCashReturns.tsx`、RPC `save_therapist_cash_return` / `get_therapist_cash_returns` / `cancel_therapist_cash_return`、本人のトークン）。種類（キャッシュバック／返金）・金額・理由（施術時間不足／クレーム対応／お釣りの返し忘れ／その他）・メモ
- 表 `reservation_cash_returns`（anon は読めない。取り消しは `cancelled_at`、行は消さない）。店舗・担当は予約からトリガーで入る
- 日別精算：締めていない日は、記録が `other_expenses` の kind = `cash_return`（`source_return_id` 付き）の行として自動で入る（`syncCashReturnItems`）。お店がセラピストに返す＝セラピストの受け取りが増え、店落ちが減る。セラピストの取り分（バック）は返金前の料金のまま。精算の後に記録されたものは赤で出し「精算に入れる」→「承認し直す」。入っていないまま承認しようとすると確認が出る
- 月別清算・月別売上：返金・キャッシュバックはお店の負担として**売上から引く**（給与・追加支給には入れない）。分け方は `splitSalaryAdjustments` の `returns`。画面・計算は `src/lib/cashReturns.ts`（テスト `npm run test:clearance-defaults`）

## セラピストの精算：支払いを分けて申請

- マイページの売上入力（`TherapistSalesPanel`）と精算ページ（`/therapist/:token/checkout`）の予約ごとの「お支払い方法」の「支払いを分ける」で、方法ごとの金額に分けて保存できる（例：はじめの会計はカード、あとから足したオプションは現金）。分け始めは今までの方法で前の料金、増えた分は別の方法（カードなら現金）。最後の行は残りの金額が自動で入る。部品は `src/components/therapist/SplitPaymentFields.tsx`、計算は `src/lib/therapistSplitPayment.ts`（テスト `npm run test:therapist-split-payment`）
- 保存は RPC `therapist_update_reservation_split`（本人のトークン）。中で分割を外してから既存の `therapist_update_reservation`（料金の確かめ・送信済みの未承認報告の取り消し）を通し、そのあと `reservations.payment_details`（[{ method, amount, fee }]、手数料は店舗の設定で計算し直す）・`payment_fee`（合計）・`payment_method`（1つ目）を入れる。1件だけ渡すと分割をやめる。管理画面の分割払いと同じ形なので、精算の合計・承認はそのまま方法ごとに分かれる

## セラピストのマイページ：その月の本数

- メニューの「◯月の本数」（`src/components/therapist/TherapistMonthlyCount.tsx`）。施術済み（completed）を大きく、予定（confirmed）を別に出す。キャンセルは数えない。指名の種類（指名なしはフリー）・コースの時間・日ごとの内訳つき。左右で過去24か月まで切り替え
- RPC `get_therapist_monthly_counts(p_token, p_month)`（anon可・トークンで本人確認・金額は返さない）。月は営業日（朝6時切り替え）。整形は `src/lib/therapistMonthlyCount.ts`
- テスト: `npm run test:therapist-monthly-count`

## 魂セラピストへの写メ日記の同時投稿

- マイページの同時投稿（HP・O2・魂）の魂分は Edge Function `post-to-sites`（`target: "esutama"`）→ Vercel `/api/automations/estama-portal-worker` → `runPreparedEstamaDiary`（`server/estama-automation.ts`）。失敗した分はマイページの「再送」で送り直す
- 2026年10月にエステ魂の投稿画面（`/tamathera/diary/post/`）が新しくなった：写真の選択欄 `#diary-photo-files` がフォームの外、写真枠3つ（`photos[n][data]` の hidden）、選ぶと切り抜き画面（`#photo-crop-modal`、714×1112）が開き「追加する」で枠に入る。カテゴリ（必須・既定は日常）とタイトル30文字までが増えた。処理は `server/estama-diary-photo-slots.ts`（以前の画面の処理 `estama-diary-photo.ts` も残して両対応）
- 600×600 の投稿画像は、魂側では縦長（714×1112）に中央で切り抜かれる
- テスト: `npm run test:estama`

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

## 面談用ページ（/interview）

- サイドバーの「面談用ページ（画面共有）」をタップすると「出稼ぎ用」（`/interview?type=dekasegi`）・「在籍用」（`?type=zaiseki`）ごとに「開く」「URLをコピー」が出る（`src/components/SidebarLinkVariants.tsx`）。ホーム画面に追加した管理アプリにはアドレスバーが無いため。コピーは `src/lib/copyText.ts`（だめなら長押しでコピーできる小窓）
- 在籍用は「勤務時間 12時間勤務」を出さない。ページはログインなしでも開ける
- 「セラピストポータル（マイページ）」の欄（できること・使い方）は出稼ぎ用・在籍用の両方に出す。中身は `InterviewGuide.tsx` の `PORTAL_FEATURES` / `PORTAL_STEPS`。マイページのメニューを増やしたらここも直す
- 「料金・報酬システム」はコース・オプション・指名ごとに 料金／バック／店落ち（料金−バック）の表（`back_rates` / `option_rates` / `nomination_rates` の表示中のもの。計算は `src/lib/interviewSystem.ts`、テスト `npm run test:interview-system`）。「人気の組み合わせ・プラン」は鉄板（艶華80分＋オプションパック -牡丹-、`SIGNATURE_COURSE` / `SIGNATURE_OPTION`）とエスたま限定プラン（説明は `back_rates.description`）。「控除・支給」は雑費・宿泊費（`clearanceDefaults.ts` の金額）・交通費（マイページで申請）・日払い。最後は「今後の流れ」（マイページ準備 → プロフィール入力 → パネル写真のアップロード → SNSアカウントはお店が作って通知、`NEXT_STEPS`）。LINE追加のQRは外した（別のページへ移す）

## LINEの定期レポート

- 「シフト空き枠レポート」（Edge Function `shift-availability-report`、毎月1・11・21日 9:00）は止めている（pg_cron `shift-availability-report` を active = false。`20261022090000_stop_shift_availability_report.sql`）
- 毎晩23時の「明日の出勤リマインド」（`send-shift-reminder`、pg_cron `shift-reminder`）は送る。後ろに付けていた「来月の空き状況」は外した

## エステ魂のシフト同期（いつ・どう反映されるか）

- シフトを保存すると DBトリガー `trg_enqueue_estama_shift` が `automation_jobs`（`estama_sync_shift`）に積む（今日〜13日後・エステ魂につながっている人だけ。担当や日付を変えたら前の枠の削除も積む）
- 流すのは2つ：①毎分の `estama-profile-sync-every-minute` → `private.dispatch_estama_profile_sync()` → Vercel `estama-profile-worker`（プロフィール同期の次に、待っているシフト同期も10件まで流す。毎時27〜42分は動かさない）②毎晩23時の `estama-shift-sync-daily` → `private.dispatch_estama_sync()` → Edge Function `estama-reconcile-dispatch`（14日分を全部送り直す）
- 2026-10-22 まで①はプロフィールだけで、ログインが切れていた間に直したシフトが翌23時まで反映されなかった（`20261022110000_estama_shift_jobs_background.sql` で直した）。ログインが切れていると、どちらも再ログイン（`estama-relogin`）まで止まる
- 結果は「エスたま自動化履歴」（`/schedule/estama-sync-history`）
