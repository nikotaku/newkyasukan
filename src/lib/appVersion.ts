// 新しい版が出たかを見分ける（ホーム画面に追加した管理アプリ・マイページは、閉じきるまで古い画面のまま動き続けるため）。
// ビルドごとに名前が変わる本体のファイル（/assets/index-xxxx.js）で比べる。画面は src/components/AppUpdateNotice.tsx。

const BUNDLE_PATTERN = /\/assets\/index-[A-Za-z0-9_-]+\.js/;

/** index.html の中から本体のファイルの場所を取り出す（無ければ null） */
export function bundlePathFromHtml(html: string): string | null {
  return html.match(BUNDLE_PATTERN)?.[0] ?? null;
}

/** 読み込み済みの本体と、公開中の本体が違えば新しい版がある（どちらか分からなければ「無い」扱い） */
export function hasNewerBundle(current: string | null, latest: string | null): boolean {
  return Boolean(current && latest && current !== latest);
}
