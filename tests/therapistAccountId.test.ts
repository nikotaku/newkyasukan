import assert from "node:assert/strict";
import test from "node:test";
import { accountEmail, accountNameCandidates, givenNameKana, kanaToRomaji, pickAccountLocalPart } from "../src/lib/therapistAccountId.ts";

test("かなをローマ字に（ヘボン式）", () => {
  assert.equal(kanaToRomaji("ゆず"), "yuzu");
  assert.equal(kanaToRomaji("キサラギ"), "kisaragi");
  assert.equal(kanaToRomaji("しょう"), "shou");
  assert.equal(kanaToRomaji("ちゃこ"), "chako");
  assert.equal(kanaToRomaji("きゅう"), "kyuu");
  assert.equal(kanaToRomaji("まっちゃ"), "matcha");
  assert.equal(kanaToRomaji("さっき"), "sakki");
  assert.equal(kanaToRomaji("かれん"), "karen");
  assert.equal(kanaToRomaji("ルーナ"), "runa");
});

test("源氏名の名前と苗字から候補を作る", () => {
  assert.equal(givenNameKana("如月ゆず"), "ゆず");
  assert.deepEqual(accountNameCandidates({ name: "如月ゆず", name_kana: "キサラギユズ" }).candidates, ["enka_yuzu", "enka_kisaragi"]);
  assert.deepEqual(accountNameCandidates({ name: "天音かれん", name_kana: "アマネカレン" }).candidates, ["enka_karen", "enka_amane"]);
  assert.deepEqual(accountNameCandidates({ name: "三上りりか" }).candidates, ["enka_ririka"]);
  assert.deepEqual(accountNameCandidates({ name: "テスト花子", name_en: "Hanako Test" }).candidates, ["enka_hanako", "enka_test"]);
  assert.ok(accountNameCandidates({ name: "源氏名未定" }).reason);
  assert.ok(accountNameCandidates({ name: "りりか&ももか" }).reason);
  assert.ok(accountNameCandidates({ name: "麗華" }).reason);
});

test("使われていれば苗字、両方なら番号", () => {
  const source = { name: "如月ゆず", name_kana: "キサラギユズ" };
  assert.equal(pickAccountLocalPart(source, []).localPart, "enka_yuzu");
  assert.equal(pickAccountLocalPart(source, ["ENKA_YUZU"]).localPart, "enka_kisaragi");
  assert.equal(pickAccountLocalPart(source, ["enka_yuzu", "enka_kisaragi"]).localPart, "enka_yuzu2");
  assert.equal(accountEmail("enka_yuzu"), "enka_yuzu@enka-salon.jp");
});
