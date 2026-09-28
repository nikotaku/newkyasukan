---
name: jev-browser
description: 外部サイトをブラウザで操作する作業（検索フォームに入力して結果を開く・動的なページを進む・一覧から探す等）を、自然文の目的1つで高速に実行するブラウザ操作エージェント jev-ultrafast（browser-use）。ページの中身を読むだけなら curl / WebFetch、キャスカン自体の画面確認は Playwright を使い、これは使わない。
---

# jev-browser（jev-ultrafast）

目的を1つ渡すと、ページの操作できる要素に番号を振り、TypeSafe の Jev が「どの操作をどの要素に」を選び、文字入力だけ小さいLLMが書く。1手ごとの判断が速い（公式の計測で Google Flights 検索が約7秒）。

## 使い方

```bash
scripts/claude/jev.sh setup    # 取得・インストール・Chromium（ヘッドレス）起動。何度実行してもよい
scripts/claude/jev.sh check    # AIを呼ばない動作確認（料金なし）。環境が変わったらまずこれ
scripts/claude/jev.sh run --url 'https://…' --goal '具体的で狭い目的'   # 料金がかかる
scripts/claude/jev.sh stop     # Chromium を止める
```

- `--goal` は複数渡すと順番に実行する。目的は「◯◯を開いたら止まる」のように終わりをはっきり書く
- 実行後は Chromium（`http://127.0.0.1:9222`、`BU_CDP_URL`）がそのまま残るので、`uv run browser-harness`（`~/.cache/jev-ultrafast` で）や Playwright の `connectOverCDP` で最終状態を自分で確かめる。**DONE を成功の証拠にしない**
- 本体は `~/.cache/jev-ultrafast`（動作確認した版に固定。`jev.sh` の `JEV_REF`）

## 必要なもの

- 環境変数 `TYPESAFE_API_KEY`（TypeSafe）と `TEXT_MODEL_API_KEY`（OpenRouter）。クラウド環境の設定で入れてもらう。チャットで受け取らない・リポジトリに書かない
- 無ければ `run` はキー名を出して止まる。`setup` / `check` はキー無しで動く

## できないこと・注意

- iframe・shadow DOM・canvas・ファイルのアップロード・ポップアップのタブ・入れ子のスクロールは非対応（MVP）。エステ魂の写真アップロード等は既存の Browserbase 自動化（`server/estama-automation.ts`）を使う
- 1回ごとに TypeSafe と OpenRouter の料金がかかる。試行錯誤は `check` とローカルのHTMLで行う
- 店舗や媒体の管理画面へのログイン・投稿・予約・支払いなど、取り消せない操作はユーザーに確認してから
- クラウドの作業環境では、プロキシのCAを Chromium の NSS に入れないと HTTPS が「Privacy error」になる（`setup` が自動で入れる。TLSの検証は切らない）
