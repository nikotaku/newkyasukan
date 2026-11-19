import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { castToEstama } from "../src/lib/estamaProfileData.ts";
import { estamaFingerprint, estamaProfileCompletion } from "../src/lib/estamaProfileCompletion.ts";

const cast = {
  name: "さくら", name_kana: "サクラ", real_name: "テスト花子", features: ["清楚系"],
  photo: "https://example.com/a.jpg", x_account: "@old_account",
  age: 24, height: 158, body_size: "84/58/84", cup_size: "D", therapist_experience: "未経験",
  favorite_techniques: "リンパ", favorite_food: "和食", ideal_type: "優しい人",
  celebrity_lookalike: "特になし", day_off_activities: "読書", hobbies: "料理",
  therapist_comment: "よろしくお願いします", shop_comment: "おすすめです",
};
const sha = (value: string) => createHash("sha256").update(value).digest("hex");
const confirmationFor = async (value = cast) => {
  const fingerprint = await estamaFingerprint(value);
  return {
    sync_status: "synced", last_profile_hash: fingerprint.profileHash,
    last_photo_hash: fingerprint.photoHash, last_error: null,
    last_profile_sync_at: "2026-11-05T13:00:00Z",
  };
};

test("既存ワーカーのSHA-256記録と同じデータを照合する", async () => {
  const data = castToEstama(cast);
  const fingerprint = await estamaFingerprint(cast);
  assert.equal(fingerprint.profileHash, sha(JSON.stringify(data)));
  assert.equal(fingerprint.photoHash, sha(JSON.stringify(data.photos)));
  assert.equal(data.twitter, "https://x.com/old_account");
});

test("登録確認で100%、SNS変更で低下、新しい内容の反映確認後に100%へ戻る", async () => {
  const confirmed = await confirmationFor();
  const previous = await estamaFingerprint(cast);
  assert.ok(estamaProfileCompletion(cast, null, previous).percent < 100);
  assert.equal(estamaProfileCompletion(cast, confirmed, previous).percent, 100);
  const changed = { ...cast, x_account: "@new_account" };
  const next = await estamaFingerprint(changed);
  assert.ok(estamaProfileCompletion(changed, confirmed, next).percent < 100);
  // 非同期の照合前でも古い指紋で100%を維持しない。
  assert.equal(estamaProfileCompletion(changed, confirmed, previous).confirmed, false);
  assert.equal(estamaProfileCompletion(changed, await confirmationFor(changed), next).percent, 100);
});

test("手動掲載チェック・予約・同期中・失敗・確認情報の欠落では100%にしない", async () => {
  const fingerprint = await estamaFingerprint(cast);
  const confirmed = await confirmationFor();
  for (const patch of [
    { sync_status: "syncing" }, { sync_status: "error" },
    { last_error: "写真の削除が未確認" }, { last_profile_hash: null },
    { last_photo_hash: null }, { last_profile_sync_at: null },
  ]) {
    assert.equal(estamaProfileCompletion(cast, { ...confirmed, ...patch }, fingerprint).confirmed, false);
  }
  assert.equal(estamaProfileCompletion(cast, null, fingerprint).confirmed, false);
  assert.equal(estamaProfileCompletion(cast, confirmed, null).confirmed, false);
});

test("写真・名前・O2・Instagramの変更も再確認する。Xの同じIDの表記違いは維持", async () => {
  const confirmed = await confirmationFor();
  for (const patch of [
    { name: "あかり" }, { photo: "https://example.com/new.jpg" },
    { o2_url: "@new_o2" }, { instagram_url: "https://instagram.com/new" },
    { shop_comment: "新しい紹介文" },
  ]) {
    const changed = { ...cast, ...patch };
    assert.equal(estamaProfileCompletion(changed, confirmed, await estamaFingerprint(changed)).confirmed, false);
  }
  const same = { ...cast, x_account: "https://twitter.com/old_account" };
  assert.equal(estamaProfileCompletion(same, confirmed, await estamaFingerprint(same)).percent, 100);
});

test("最新の反映確認済みでも、未入力項目に応じて登録率が下がる", async () => {
  const results = [];
  for (const value of [cast, { ...cast, name: "源氏名未定" }, { ...cast, name: "源氏名未定", photo: "" }]) {
    const result = estamaProfileCompletion(value, await confirmationFor(value), await estamaFingerprint(value));
    assert.equal(result.confirmed, true);
    results.push(result);
  }
  assert.deepEqual(results.map(result => result.missingCount), [0, 1, 2]);
  assert.ok(results[0].percent > results[1].percent && results[1].percent > results[2].percent);
});
