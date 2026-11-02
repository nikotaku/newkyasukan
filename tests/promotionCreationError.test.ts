import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { promotionCreationErrorMessage } from "../src/lib/promotionCreationError.ts";

test("関数のHTTPエラーからJSON本文を取り出し、SDKの一般文で隠さない", async () => {
  const context = new Response(JSON.stringify({ error: "AIが指定した掲載回数どおりに作成できませんでした" }), { status: 500 });
  assert.equal(await promotionCreationErrorMessage({ message: "Edge Function returned a non-2xx status code", context }), "AIが指定した掲載回数どおりに作成できませんでした");
  assert.equal(context.bodyUsed, false, "レスポンス本体は消費しない");
});

test("PostgRESTのErrorでないオブジェクトもmessageを表示する", async () => {
  assert.equal(await promotionCreationErrorMessage({ code: "23514", message: "掲載回数が範囲外です" }), "掲載回数が範囲外です");
  assert.equal(await promotionCreationErrorMessage(new Error("AIの接続設定がありません")), "AIの接続設定がありません");
});

test("期限切れ・権限・混雑を日本語で表示し、生HTMLを出さない", async () => {
  assert.match(await promotionCreationErrorMessage({ context: new Response("Invalid JWT", { status: 401 }) }), /再ログイン/);
  assert.match(await promotionCreationErrorMessage({ context: new Response("<html>forbidden</html>", { status: 403 }) }), /権限/);
  assert.match(await promotionCreationErrorMessage({ context: new Response("too many requests", { status: 429 }) }), /混み合って/);
  assert.match(await promotionCreationErrorMessage({ context: new Response("<html>bad gateway</html>", { status: 502 }) }), /HTTP 502/);
  assert.doesNotMatch(await promotionCreationErrorMessage({ context: new Response("<html>error</html>", { status: 500 }) }), /html/);
});

test("不明なエラーにも再試行の案内を返す", async () => {
  assert.match(await promotionCreationErrorMessage(null), /もう一度/);
  assert.match(await promotionCreationErrorMessage({}), /もう一度/);
});

test("作成ダイアログにエラーが残り、セラピスト一覧の再読み込みができる", () => {
  const page = readFileSync(new URL("../src/pages/PromotionSchedule.tsx", import.meta.url), "utf8");
  assert.match(page, /await promotionCreationErrorMessage\(error\)/);
  assert.match(page, /role="alert"[\s\S]*createError/);
  assert.match(page, /セラピスト一覧を再読み込み/);
});
