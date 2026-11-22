import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const storeInfoPath = new URL("../src/pages/StoreInfo.tsx", import.meta.url);
const dashboardPath = new URL("../src/pages/SettingsDashboard.tsx", import.meta.url);

test("店舗情報はiPhoneで常に押せる固定保存ボタンを持つ", async () => {
  const source = await readFile(storeInfoPath, "utf8");
  assert.match(source, /fixed inset-x-0 bottom-0 z-50/);
  assert.match(source, /pb-\[calc\(0\.75rem\+env\(safe-area-inset-bottom\)\)\]/);
  assert.match(source, /変更を保存/);
  assert.match(source, /hidden min-h-12[^"]*sm:inline-flex/);
  assert.match(source, /backdrop-blur sm:hidden/);
  assert.match(source, /email: data\.email \?\? ""/);
  assert.equal((source.match(/type="button"/g) ?? []).length, 2);
  assert.equal((source.match(/touch-manipulation/g) ?? []).length, 2);
});

test("横スクロールする設定タブより編集画面を前面に置く", async () => {
  const source = await readFile(dashboardPath, "utf8");
  assert.match(source, /overflow-x-auto/);
  assert.match(source, /TabsContent value=\{current\.value\} className="relative z-10 mt-0"/);
});
