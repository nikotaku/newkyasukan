# DBバックアップ（GitHub Actions）

Supabase無料プランには自動バックアップがないため、`.github/workflows/db-backup.yml` が毎日 4:05（日本時間）に本番DBのダンプを取り、暗号化してGitHub Actionsの成果物（Artifacts）に30日分保存する。

- 保存場所: GitHub → Actions → 「DB backup」の各実行 → Artifacts（`db-backup-YYYYMMDD-HHMM.tar.gz.gpg`）
- リポジトリは公開なので、ダンプはAES256で暗号化してから保存している。暗号化パスワードを知らないと中身は読めない
- 中身: `schema.sql`（テーブル定義・関数・RLSポリシー・権限）と `data.sql`（COPY形式のデータ）

## 対象と対象外

| | 内容 |
|---|---|
| 取得する | `public` / `private` / `focus120` スキーマ（アプリの全テーブル・データ） |
| 取得しない | `auth`（ログインユーザー）, `storage`（Storageのメタデータ）, `realtime`, `supabase_migrations`, `vault` などのSupabase管理スキーマ、ロール定義（roles.sql）、Storageの実ファイル |

Supabase管理スキーマは、バックアップ用ロールでは読み出せない（所有者が `supabase_admin` で、`postgres` でも個別の権限付与ができない）。また別プロジェクトへ復元した場合はSupabase側が持つことになる。復元後にスタッフなどのログインユーザーは作り直す必要がある。

## 接続に使うロール

`SUPABASE_DB_URL` は `postgres` ではなく、バックアップ専用ロール **`db_backup_reader`** の接続文字列を使う。理由は、`postgres` のDBパスワードがSupabaseのダッシュボードに表示されず（Connect画面は `[YOUR-DATABASE-PASSWORD]` の伏せ字のみ）、本番のパスワードを変更しないため。

`db_backup_reader` の設定（Supabase SQL Editor で実行済み・記録用）:

```sql
create role db_backup_reader login password '<strong-password>' noinherit;
grant pg_read_all_data to db_backup_reader;
alter role db_backup_reader bypassrls;      -- RLS付きテーブルも全行読めるように
alter role db_backup_reader inherit;
-- public / private / focus120 に USAGE と SELECT（既存＋今後作成されるテーブル・シーケンス）
```

`supabase db dump` は内部で `SET ROLE postgres` を行うため専用ロールでは `permission denied to set role "postgres"` で失敗する（Supabase公式KBの記載）。そのためワークフローでは `pg_dump` を直接使っている。

## 初回設定（済み）

GitHub → Settings → Secrets and variables → Actions に2つ登録する。

| 名前 | 中身 |
|---|---|
| `SUPABASE_DB_URL` | `postgresql://db_backup_reader.imrxzkivwrkqbhqfbbes:<パスワード>@aws-1-ap-northeast-1.pooler.supabase.com:5432/postgres`（Session pooler。GitHub ActionsはIPv6非対応のためDirect connectionは使えない） |
| `BACKUP_PASSPHRASE` | 暗号化パスワード。**なくすと復元できない**ので、Supabase以外の場所（パスワード管理アプリ等）に保管する |

パスワードを変えるときは、Supabase SQL Editor で `alter role db_backup_reader password '<new>';` を実行し、`SUPABASE_DB_URL` のシークレットを更新する。共有プーラーは古い認証情報を一時的にキャッシュするので、切り替え直後は失敗することがある（時間をおいて再実行）。

登録後、Actions → DB backup → Run workflow で手動実行し、成功することを確認する。

## 復元手順

1. 復元したい日の実行から成果物（zip）をダウンロードして展開する
2. 復号して展開する
   ```bash
   gpg -d db-backup-YYYYMMDD-HHMM.tar.gz.gpg > backup.tar.gz   # 暗号化パスワードを入力
   mkdir backup && tar -xzf backup.tar.gz -C backup
   ```
3. 復元先のDB（新しいSupabaseプロジェクト推奨）へ流し込む
   ```bash
   psql --single-transaction --variable ON_ERROR_STOP=1 \
     --command 'SET session_replication_role = replica' \
     --file backup/schema.sql \
     --file backup/data.sql \
     --dbname "復元先の接続文字列"
   ```
4. 復元後にやること
   - スタッフ等のログインユーザーを `auth` に作り直す（このバックアップには含まれない）
   - Storageの画像ファイルは含まれないので、必要なら別途コピーする
   - `private` / `focus120` スキーマの関数・権限は `schema.sql` に入っているが、所有ロールは `--no-owner` で落としているため、復元先のロールで作り直される
