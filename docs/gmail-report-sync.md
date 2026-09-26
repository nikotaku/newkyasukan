# レポートメールの自動取り込み（Gmail → 問い合わせ集計）

問い合わせ集計（`/inquiry-stats`）の次の列は、Gmailに届くメールから取り込んでいる。

| 列 | 元のメール |
|---|---|
| 電話・エステ魂仮予約 | IVRyの「【着信内容の報告通知】…からのお電話【IVRy】」（0120-286-634 からの着信がエステ魂仮予約） |
| エステ魂予約・媒体アクセス | 「【エステ魂】デイリーレポート(○月○日集計分)」 |

レポートを受け取っている Gmail アカウントで Google Apps Script を動かし、15分ごとに Edge Function `report-email-ingest` へ送る。Codex などの手作業は不要。

## 初回設定（1回だけ）

1. レポートが届く Gmail アカウントでログインした状態で https://script.google.com を開き、「新しいプロジェクト」を作る
2. 最初からあるコードをすべて消し、`scripts/gmail-report-sync.gs` の内容を貼り付ける
3. `TOKEN` を、管理側で発行したトークンに書き換える（トークンはリポジトリに入れない）
4. 保存し、上部の関数の選択で `setup` を選んで「実行」を押す
5. 「承認が必要です」→ アカウントを選ぶ →「詳細」→「（安全ではないページ）に移動」→「許可」
   - Gmail の読み取りと外部への送信の許可を求められる。自分で作ったスクリプトなので問題ない
6. 実行ログに「○通を確認し、○件を新しく取り込みました」と出れば完了。以後は15分ごとに自動で動く

初回は `BACKFILL_SINCE`（2026/09/01）以降の分をまとめて送る。同じメールは何度送っても1回しか取り込まない。

## トークンの発行

トークンは店舗ごと。本体は保存せず、SHA-256 を `report_ingest_tokens` に入れる。

```sql
insert into public.report_ingest_tokens (store_id, token_hash, label)
values ('<店舗ID>', encode(extensions.digest('<ランダムな48文字以上>', 'sha256'), 'hex'), 'Gmail Apps Script');
```

## 動作の確認

- 届いたメールと読み取り結果は `report_email_messages` に残る（`status`: imported / duplicate / kept_existing / unparsed / ignored）
- `unparsed` はメールの書式が想定と違うもの。`body` を見て `supabase/functions/report-email-ingest/parse.ts` を直し、Apps Script の `resendAll` を実行すると取り込み直せる
- エステ魂の日次は、その日の行が既にあれば上書きしない（`kept_existing`）
