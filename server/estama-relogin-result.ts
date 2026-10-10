// エステ魂の自動再ログインの判定（画面に依存しない部分。テスト tests/estamaRelogin.test.ts）

/** エラー文にログイン情報が混ざらないようにする */
export function scrubSecrets(message: string, secrets: Array<string | undefined>) {
  let result = message;
  for (const secret of secrets) {
    if (secret && secret.length >= 3) result = result.split(secret).join("***");
  }
  return result.slice(0, 500);
}

/** ログインを押したあとの画面から、結果を判断する */
export function classifyLoginResult(input: { url: string; hasEditor: boolean; hasPasswordField: boolean; validation: string }) {
  if (input.hasEditor || (/\/admin\//.test(input.url) && !input.hasPasswordField)) return { ok: true as const };
  const validation = input.validation.replace(/\s+/g, " ").trim();
  if (validation) return { ok: false as const, error: `エステ魂がログインを受け付けませんでした：${validation.slice(0, 200)}` };
  return { ok: false as const, error: "ログイン後に管理画面へ移れませんでした（メールアドレス・パスワードを確認してください）" };
}
