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

## AI生成機能

- Edge Function `generate-cast-content` がカテゴリ別のAIコンテンツ生成を担当
  - `type`: profile / announcement / catchphrase / news / coupon / schedule / shop_comment / newstaff
  - Lovable AI Gateway 経由で `google/gemini-2.5-flash` を使用
