import { test } from "node:test";
import assert from "node:assert/strict";
import {
  PANEL_PHOTO_HEIGHT,
  PANEL_PHOTO_WIDTH,
  keptShare,
  needsSubjectDetection,
  panelCropRect,
  subjectBoxFromConfidence,
} from "../src/lib/panelPhotoCrop.ts";

const RATIO = PANEL_PHOTO_WIDTH / PANEL_PHOTO_HEIGHT;
const close = (a: number, b: number, eps = 0.5) => assert.ok(Math.abs(a - b) <= eps, `${a} ≒ ${b}`);

test("パネルの大きさは HP・エステ魂と同じ 357×556", () => {
  assert.equal(PANEL_PHOTO_WIDTH, 357);
  assert.equal(PANEL_PHOTO_HEIGHT, 556);
});

test("縦3:4の写真は高さをそのまま、左右を少しだけ切る（人を見分けなくてよい）", () => {
  const rect = panelCropRect({ width: 3024, height: 4032 });
  assert.equal(rect.height, 4032);
  close(rect.width, 4032 * RATIO);
  close(rect.x, (3024 - rect.width) / 2);
  assert.equal(rect.y, 0);
  assert.equal(needsSubjectDetection({ width: 3024, height: 4032 }), false);
  assert.ok(keptShare({ width: 3024, height: 4032 }) > 0.85);
});

test("正方形・横長の写真は大きく切るので人の位置を見分ける", () => {
  assert.equal(needsSubjectDetection({ width: 1000, height: 1000 }), true);
  assert.equal(needsSubjectDetection({ width: 4032, height: 3024 }), true);
});

test("切り抜きはいつも 357:556 で、写真からはみ出さない", () => {
  for (const size of [
    { width: 4032, height: 3024 },
    { width: 1080, height: 1920 },
    { width: 357, height: 556 },
    { width: 200, height: 2000 },
    { width: 3000, height: 100 },
  ]) {
    const rect = panelCropRect(size, { left: 0.9, top: 0.9, right: 1, bottom: 1, centerX: 0.98 });
    close(rect.width / rect.height, RATIO, 0.001);
    assert.ok(rect.x >= 0 && rect.y >= 0);
    assert.ok(rect.x + rect.width <= size.width + 0.001);
    assert.ok(rect.y + rect.height <= size.height + 0.001);
  }
});

test("横長の写真は人の体の中心に合わせて左右を切る", () => {
  const size = { width: 4000, height: 3000 };
  const rect = panelCropRect(size, { left: 0.1, top: 0.1, right: 0.4, bottom: 1, centerX: 0.25 });
  close(rect.x + rect.width / 2, 1000);
});

test("人の範囲が入りきる大きさなら、腕などの端も切れないように寄せる", () => {
  const size = { width: 4000, height: 3000 };
  // 体の中心は左寄り（0.3）だが、右手が 0.58 まで伸びている
  const rect = panelCropRect(size, { left: 0.2, top: 0.1, right: 0.58, bottom: 1, centerX: 0.3 });
  assert.ok(rect.x <= 0.2 * 4000);
  assert.ok(rect.x + rect.width >= 0.58 * 4000 - 0.001);
});

test("人が端にいても写真の外は切らない", () => {
  const size = { width: 4000, height: 3000 };
  const rect = panelCropRect(size, { left: 0, top: 0, right: 0.1, bottom: 1, centerX: 0.02 });
  assert.equal(rect.x, 0);
});

test("縦に長い写真で人が見つからないときは上寄りで切る（顔が切れにくい）", () => {
  const size = { width: 1000, height: 3000 };
  const rect = panelCropRect(size);
  close(rect.y, (3000 - rect.height) * 0.3);
});

test("縦に長い写真は頭の上に少し余白を残して切る", () => {
  const size = { width: 1000, height: 3000 };
  const rect = panelCropRect(size, { left: 0.2, top: 0.5, right: 0.8, bottom: 0.9, centerX: 0.5 });
  const top = 0.5 * 3000;
  assert.ok(rect.y < top, "頭より上から切る");
  assert.ok(top - rect.y >= rect.height * 0.06 - 0.001);
  assert.ok(rect.y + rect.height >= 0.9 * 3000 - 0.001, "全身が入る");
});

test("人が切り抜きより大きいときは頭を優先して残す", () => {
  const size = { width: 1000, height: 4000 };
  const rect = panelCropRect(size, { left: 0.1, top: 0.2, right: 0.9, bottom: 1, centerX: 0.5 });
  close(rect.y, 0.2 * 4000 - rect.height * 0.06);
});

test("人の確からしさから範囲と体の中心を出す", () => {
  const w = 10;
  const h = 10;
  const conf = new Array(w * h).fill(0);
  for (let y = 2; y < 9; y++) for (let x = 3; x < 6; x++) conf[y * w + x] = 0.9;
  const box = subjectBoxFromConfidence(conf, w, h);
  assert.ok(box);
  close(box.left, 0.3, 1e-9);
  close(box.right, 0.6, 1e-9);
  close(box.top, 0.2, 1e-9);
  close(box.bottom, 0.9, 1e-9);
  close(box.centerX, 0.45, 1e-9);
});

test("人がほとんど写っていなければ null（真ん中で切る）", () => {
  const conf = new Array(100 * 100).fill(0);
  conf[5050] = 1;
  assert.equal(subjectBoxFromConfidence(conf, 100, 100), null);
  assert.equal(subjectBoxFromConfidence([], 0, 0), null);
});
