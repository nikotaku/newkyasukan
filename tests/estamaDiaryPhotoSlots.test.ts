import assert from "node:assert/strict";
import test from "node:test";

import type { Locator, Page } from "playwright-core";

import {
  assertEstamaDiarySlotPhotoReady,
  attachEstamaDiarySlotPhoto,
  isEstamaDiarySlotPhotoReady,
  type EstamaDiarySlotState,
} from "../server/estama-diary-photo-slots.ts";
import { fitEstamaDiaryTitle } from "../server/estama-diary-wording.ts";

const empty: EstamaDiarySlotState = { slots: 3, filled: 0, ready: 0, error: "" };
const attached: EstamaDiarySlotState = { slots: 3, filled: 1, ready: 1, error: "" };
const photo = { name: "photo-1.jpg", mimeType: "image/jpeg", buffer: Buffer.from("jpeg") };
const immediate = { timeoutMs: 0, pollIntervalMs: 0 };

const createHarness = ({
  initialState = empty,
  finalState = attached,
  inputCount = 1,
  confirmCount = 1,
  confirmEnabled = true,
  confirmText = "追加する",
  modalVisibleAfterClick = false,
}: {
  initialState?: EstamaDiarySlotState;
  finalState?: EstamaDiarySlotState;
  inputCount?: number;
  confirmCount?: number;
  confirmEnabled?: boolean;
  confirmText?: string;
  modalVisibleAfterClick?: boolean;
} = {}) => {
  let selected = 0;
  let clicked = 0;

  const form = {
    async evaluate() {
      return clicked ? finalState : initialState;
    },
  } as unknown as Locator;

  const confirm = {
    async count() { return confirmCount; },
    async isEnabled() { return confirmEnabled; },
    async innerText() { return confirmText; },
    async click() { clicked += 1; },
  };
  const modal = {
    async isVisible() { return clicked ? modalVisibleAfterClick : selected > 0; },
    locator(selector: string) {
      if (selector === 'button[type="button"][data-crop-confirm]') return confirm;
      throw new Error(`Unexpected modal locator: ${selector}`);
    },
  };
  const fileInput = {
    async count() { return inputCount; },
    async setInputFiles() { selected += 1; },
  };
  const page = {
    locator(selector: string) {
      if (selector === 'input[type="file"]#diary-photo-files') return fileInput;
      if (selector === "#photo-crop-modal") return modal;
      throw new Error(`Unexpected locator: ${selector}`);
    },
    async waitForTimeout() {
      // テストでは待たない
    },
  } as unknown as Page;

  return {
    form,
    page,
    get selected() { return selected; },
    get clicked() { return clicked; },
  };
};

test("写真を選んで切り抜きの「追加する」を押すと、写真枠に1枚入る", async () => {
  const harness = createHarness();
  const state = await attachEstamaDiarySlotPhoto(harness.page, harness.form, photo, immediate);
  assert.deepEqual(state, attached);
  assert.equal(harness.selected, 1);
  assert.equal(harness.clicked, 1);
});

test("写真枠にすでに画像があれば、何もせず止める", async () => {
  const harness = createHarness({ initialState: { ...empty, filled: 1, ready: 1 } });
  await assert.rejects(attachEstamaDiarySlotPhoto(harness.page, harness.form, photo, immediate), /すでに画像が入っています/);
  assert.equal(harness.selected, 0);
});

test("写真枠が無ければ止める", async () => {
  const harness = createHarness({ initialState: { ...empty, slots: 0 } });
  await assert.rejects(attachEstamaDiarySlotPhoto(harness.page, harness.form, photo, immediate), /写真枠が見つかりません/);
});

for (const inputCount of [0, 2]) {
  test(`写真の選択欄が${inputCount}件なら写真を入れない`, async () => {
    const harness = createHarness({ inputCount });
    await assert.rejects(
      attachEstamaDiarySlotPhoto(harness.page, harness.form, photo, immediate),
      new RegExp(`写真の選択欄を特定できません（${inputCount}件）`),
    );
    assert.equal(harness.selected, 0);
  });
}

test("「追加する」が押せる状態にならなければ押さない", async () => {
  const harness = createHarness({ confirmEnabled: false });
  await assert.rejects(attachEstamaDiarySlotPhoto(harness.page, harness.form, photo, immediate), /画像切り取り画面を準備できません/);
  assert.equal(harness.clicked, 0);
});

test("切り抜きのボタンが「追加する」でなければ押さない", async () => {
  const harness = createHarness({ confirmText: "キャンセル" });
  await assert.rejects(attachEstamaDiarySlotPhoto(harness.page, harness.form, photo, immediate), /ボタンが想定と異なります/);
  assert.equal(harness.clicked, 0);
});

test("押したあと写真枠に入らなければ失敗にする（投稿しない）", async () => {
  const harness = createHarness({ finalState: empty });
  await assert.rejects(attachEstamaDiarySlotPhoto(harness.page, harness.form, photo, immediate), /画像切り取りを完了できません/);
});

test("押したあとプレビューが714×1112で読み込めていなければ失敗にする", async () => {
  const harness = createHarness({ finalState: { ...attached, ready: 0 } });
  await assert.rejects(attachEstamaDiarySlotPhoto(harness.page, harness.form, photo, immediate), /画像切り取りを完了できません/);
});

test("画面が写真を受け付けなかったらその理由で止める", async () => {
  const harness = createHarness({ finalState: { ...empty, error: "16MB以内のJPEG・PNG画像を選択してください。" } });
  await assert.rejects(attachEstamaDiarySlotPhoto(harness.page, harness.form, photo, immediate), /JPEG・PNG/);
});

test("送信直前の確認：指定どおりの枚数が入っていれば通す", async () => {
  assert.equal(isEstamaDiarySlotPhotoReady(attached, 1), true);
  assert.equal(isEstamaDiarySlotPhotoReady({ ...attached, filled: 2, ready: 2 }, 1), false);
  assert.equal(isEstamaDiarySlotPhotoReady({ ...attached, error: "エラー" }, 1), false);
  const harness = createHarness({ initialState: attached });
  assert.deepEqual(await assertEstamaDiarySlotPhotoReady(harness.form, 1), attached);
  await assert.rejects(assertEstamaDiarySlotPhotoReady(createHarness().form, 1), /送信用画像を準備できません（指定1枚 \/ 設定0枚）/);
});

test("タイトルは投稿画面の文字数上限に収める（絵文字の途中で切らない）", () => {
  assert.equal(fitEstamaDiaryTitle("まってます🥹🌟", 30), "まってます🥹🌟");
  assert.equal(fitEstamaDiaryTitle("あ".repeat(35), 30), "あ".repeat(30));
  // 「🥹」は2文字分（UTF-16）。29文字＋絵文字は31になるので絵文字の手前で切る
  assert.equal(fitEstamaDiaryTitle(`${"あ".repeat(29)}🥹`, 30), "あ".repeat(29));
  assert.equal(fitEstamaDiaryTitle("", 30), "写メ日記");
  assert.equal(fitEstamaDiaryTitle("長いタイトル", null), "長いタイトル");
});
