# DBバックアップ（GitHub Actions）

Supabase無料プランには自動バックアップがないため、`.github/workflows/db-backup.yml` が毎日 4:05（日本時間）に本番DBのダンプを取り、暗号化してGitHub Actionsの成果物（Artifacts）に30日分保存する。

- 対象: 本番DB（ロール・スキーマ・データ）。Storageの画像ファイルは含まない
- 保存場所: GitHub → Actions → 「DB backup」の各実行 → Artifacts（`db-backup-YYYYMMDD-HHMM.tar.gz.gpg`）
- リポジトリは公開なので、ダンプはAES256で暗号化してから保存している。暗号化パスワードを知らないと中身は読めない

## 初回設定

GitHub → Settings → Secrets and variables → Actions → New repository secret で2つ登録する。

| 名前 | 中身 |
|---|---|
| `SUPABASE_DB_URL` | Supabase管理画面 → Connect → **Session pooler** の接続文字列（`[YOUR-PASSWORD]` をDBパスワードに置き換える）。GitHub ActionsはIPv6非対応のため、Direct connection ではなく Session pooler を使う |
| `BACKUP_PASSPHRASE` | 暗号化パスワード。**なくすと復元できない**ので、Supabase以外の場所（パスワード管理アプリ等）に保管する |

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
     --file backup/roles.sql \
     --file backup/schema.sql \
     --command 'SET session_replication_role = replica' \
     --file backup/data.sql \
     --dbname "復元先の接続文字列"
   ```
