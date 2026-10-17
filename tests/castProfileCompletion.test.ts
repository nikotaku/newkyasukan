import assert from "node:assert/strict";
import test from "node:test";

import {
  CAST_PROFILE_ITEMS,
  castAdminLabel,
  castProfileCompletion,
  isStageNamePending,
} from "../src/lib/castProfileCompletion.ts";

test("源氏名が空・未定・名称未設定なら未定", () => {
  assert.equal(isStageNamePending(""), true);
  assert.equal(isStageNamePending("  "), true);
  assert.equal(isStageNamePending(null), true);
  assert.equal(isStageNamePending("源氏名未定"), true);
  assert.equal(isStageNamePending("名称未設定"), true);
  assert.equal(isStageNamePending("さくら"), false);
});

test("スタッフ画面の名前：源氏名が未定なら本名を出す", () => {
  assert.equal(castAdminLabel({ name: "さくら", real_name: "テスト花子" }), "さくら");
  assert.equal(castAdminLabel({ name: "源氏名未定", real_name: "テスト花子" }), "テスト花子（源氏名未定）");
  assert.equal(castAdminLabel({ name: "源氏名未定", real_name: "" }), "源氏名未定");
});

test("本名だけの登録は少しだけ、全部入れば100%", () => {
  const onlyReal = castProfileCompletion({ name: "源氏名未定", real_name: "テスト花子" });
  assert.equal(onlyReal.done, 1);
  assert.equal(onlyReal.total, CAST_PROFILE_ITEMS.length);
  assert.ok(onlyReal.missing.includes("源氏名"));
  assert.equal(onlyReal.percent, Math.round(100 / CAST_PROFILE_ITEMS.length));

  const full = castProfileCompletion({
    name: "さくら",
    real_name: "テスト花子",
    photo: "https://example.com/a.jpg",
    age: 24,
    height: 158,
    bust: 84,
    waist: 58,
    hip: 84,
    cup_size: "D",
    therapist_experience: "4年",
    favorite_techniques: "全部",
    favorite_food: "ネギ塩タン",
    ideal_type: "紳士",
    celebrity_lookalike: "テスト",
    day_off_activities: "美容",
    hobbies: "料理",
    therapist_comment: "よろしくお願いします",
    shop_comment: "おすすめです",
  });
  assert.equal(full.percent, 100);
  assert.deepEqual(full.missing, []);
});

test("片方の欄で埋まる項目（3サイズ・カップ・歴・趣味・コメント）", () => {
  const result = castProfileCompletion({
    name: "さくら",
    body_size: "84/58/84",
    bust_size: "D",
    therapist_years: 3,
    hobby: "料理",
    profile: "こんにちは",
  });
  for (const label of ["スリーサイズ", "カップ", "セラピスト歴", "趣味・特技", "セラピストコメント"]) {
    assert.ok(!result.missing.includes(label), label);
  }
  assert.ok(result.missing.includes("身長"));
  // 0 や空白は入っていない扱い
  assert.ok(castProfileCompletion({ name: "さくら", age: 0, favorite_food: "  " }).missing.includes("年齢"));
});
