import { test } from "node:test";
import assert from "node:assert/strict";
import {
  adjustPixels,
  clampOffsets,
  frameSize,
  initialPhotoEditState,
  offsetLimits,
  rotatedSize,
} from "../src/lib/photoEditor.ts";

test("回転すると幅と高さが入れ替わる", () => {
  assert.deepEqual(rotatedSize(1200, 1600, 90), { width: 1600, height: 1200 });
  assert.deepEqual(rotatedSize(1200, 1600, 180), { width: 1200, height: 1600 });
});

test("枠の大きさは比率に合わせ、元の画像より大きくしない", () => {
  const base = initialPhotoEditState();
  assert.deepEqual(frameSize(1200, 1600, { ...base, aspect: "original" }, 2000), { width: 1200, height: 1600 });
  assert.deepEqual(frameSize(1200, 1600, { ...base, aspect: "1:1" }, 2000), { width: 1600, height: 1600 });
  assert.deepEqual(frameSize(3000, 4000, { ...base, aspect: "3:4" }, 2000), { width: 1500, height: 2000 });
  assert.deepEqual(frameSize(1200, 1600, { ...base, aspect: "original", rotation: 90 }, 800), { width: 800, height: 600 });
});

test("寄っていないときは、比率が同じなら動かせない", () => {
  const base = initialPhotoEditState();
  assert.deepEqual(offsetLimits(1200, 1600, base), { x: 0, y: 0 });
  const clamped = clampOffsets({ width: 1200, height: 1600 }, { ...base, offsetX: 0.3 });
  assert.equal(clamped.offsetX, 0);
});

test("寄ると動かせる幅が増え、限度で止まる", () => {
  const base = { ...initialPhotoEditState(), zoom: 2 };
  const limit = offsetLimits(1200, 1600, base);
  assert.ok(Math.abs(limit.x - 0.5) < 1e-9);
  const clamped = clampOffsets({ width: 1200, height: 1600 }, { ...base, offsetX: 0.9, offsetY: -0.9 });
  assert.ok(Math.abs(clamped.offsetX - 0.5) < 1e-9);
  assert.ok(Math.abs(clamped.offsetY + 0.5) < 1e-9);
});

test("明るさ・彩度の調整", () => {
  const px = new Uint8ClampedArray([100, 100, 100, 255]);
  adjustPixels(px, 50, 0, 0);
  assert.equal(px[0], 164);
  const color = new Uint8ClampedArray([200, 100, 50, 255]);
  adjustPixels(color, 0, 0, -100);
  assert.equal(color[0], color[1]);
  assert.equal(color[1], color[2]);
  const same = new Uint8ClampedArray([10, 20, 30, 255]);
  adjustPixels(same, 0, 0, 0);
  assert.deepEqual([...same], [10, 20, 30, 255]);
});

test("なぞった2点から残す楕円を作る（小さすぎない）", async () => {
  const { ellipseFromDrag } = await import("../src/lib/photoEditor.ts");
  assert.deepEqual(ellipseFromDrag({ x: 0.2, y: 0.1 }, { x: 0.8, y: 0.9 }), { x: 0.5, y: 0.5, rx: 0.30000000000000004, ry: 0.4 });
  const tiny = ellipseFromDrag({ x: 0.5, y: 0.5 }, { x: 0.5, y: 0.5 });
  assert.equal(tiny.rx, 0.03);
  assert.equal(tiny.ry, 0.03);
});
