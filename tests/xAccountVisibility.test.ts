import assert from "node:assert/strict";
import test from "node:test";
import { shouldDisplayXSubAccount } from "../src/lib/xAccountVisibility.ts";

test("Xサブ垢はIDと公開設定がそろった場合だけ表示する", () => {
  assert.equal(shouldDisplayXSubAccount("https://x.com/enka_asami_sub", true), true);
  assert.equal(shouldDisplayXSubAccount("@enka_asami_sub", true), true);
});

test("公開設定がオフまたはIDがないXサブ垢は表示しない", () => {
  assert.equal(shouldDisplayXSubAccount("https://x.com/enka_asami_sub", false), false);
  assert.equal(shouldDisplayXSubAccount(null, true), false);
  assert.equal(shouldDisplayXSubAccount("   ", true), false);
});
