import type { Locator, Page } from "playwright-core";

// 魂セラピストの写メ日記（2026年10月の新しい投稿画面）の写真。
// 画面には写真枠が3つ（photos[n][data] の hidden）あり、写真の選択欄 #diary-photo-files はフォームの外にある。
// 選択欄に写真を入れると切り抜き画面（#photo-crop-modal、714×1112）が開き、「追加する」で
// 空いている写真枠の photos[n][data] に JPEG の Data URL が入る。

export const ESTAMA_DIARY_SLOT_WIDTH = 714;
export const ESTAMA_DIARY_SLOT_HEIGHT = 1112;

export type EstamaDiarySlotPhoto = {
  name: string;
  mimeType: string;
  buffer: Buffer;
};

export type EstamaDiarySlotState = {
  /** 写真枠の数 */
  slots: number;
  /** photos[n][data] に JPEG の Data URL が入っている枠の数 */
  filled: number;
  /** 画像が入っていて、プレビューが表示・読み込み済みで 714×1112 の枠の数 */
  ready: number;
  /** 画面に出ている写真のエラー */
  error: string;
};

type AttachOptions = {
  timeoutMs?: number;
  pollIntervalMs?: number;
};

const sleep = (page: Page, milliseconds: number) => page.waitForTimeout(milliseconds);

/** 新しい投稿画面（写真枠つき）かどうか */
export async function hasEstamaDiaryPhotoSlots(form: Locator) {
  return form.evaluate((element) => Boolean(
    element.querySelector("[data-js-diary-photos] [data-photo-slot] input[type=\"hidden\"][data-photo-data]"),
  )).catch(() => false);
}

export async function inspectEstamaDiarySlotState(form: Locator): Promise<EstamaDiarySlotState> {
  return form.evaluate((element, size) => {
    const slots = Array.from(element.querySelectorAll("[data-js-diary-photos] [data-photo-slot]"));
    let filled = 0;
    let ready = 0;
    for (const slot of slots) {
      const data = slot.querySelector<HTMLInputElement>("input[type=\"hidden\"][data-photo-data]");
      const preview = slot.querySelector<HTMLImageElement>("img[data-photo-preview]");
      const value = data?.value.trim() || "";
      if (!/^data:image\/jpeg;base64,/i.test(value)) continue;
      filled += 1;
      const previewVisible = Boolean(preview && !preview.classList.contains("hidden") && preview.getClientRects().length > 0);
      if (previewVisible && preview?.complete
        && preview.naturalWidth === size.width && preview.naturalHeight === size.height) ready += 1;
    }
    const errorElement = element.querySelector<HTMLElement>("[data-js-diary-photos] [data-photo-error]");
    const error = errorElement && !errorElement.classList.contains("hidden")
      ? (errorElement.textContent || "").replace(/\s+/g, " ").trim()
      : "";
    return { slots: slots.length, filled, ready, error };
  }, { width: ESTAMA_DIARY_SLOT_WIDTH, height: ESTAMA_DIARY_SLOT_HEIGHT });
}

export function isEstamaDiarySlotPhotoReady(state: EstamaDiarySlotState, expected: number) {
  return !state.error && state.slots >= expected && state.filled === expected && state.ready === expected;
}

export async function assertEstamaDiarySlotPhotoReady(form: Locator, expected: number) {
  const state = await inspectEstamaDiarySlotState(form);
  console.log(JSON.stringify({ event: "estama_diary_slot_photo_ready", expected, ...state }));
  if (!isEstamaDiarySlotPhotoReady(state, expected)) {
    throw new Error(`魂セラピストの送信用画像を準備できません（指定${expected}枚 / 設定${state.filled}枚${state.error ? ` / ${state.error}` : ""}）`);
  }
  return state;
}

/** 写真を1枚選び、切り抜き画面の「追加する」まで進めて、写真枠に入ったことを確かめる（投稿はしない） */
export async function attachEstamaDiarySlotPhoto(
  page: Page,
  form: Locator,
  photo: EstamaDiarySlotPhoto,
  options: AttachOptions = {},
) {
  const timeoutMs = options.timeoutMs ?? 15_000;
  const pollIntervalMs = options.pollIntervalMs ?? 250;

  const initial = await inspectEstamaDiarySlotState(form);
  if (initial.slots < 1) throw new Error("魂セラピストの写真枠が見つかりません");
  if (initial.filled !== 0) {
    throw new Error(`魂セラピストの写真枠にすでに画像が入っています（${initial.filled}枚）`);
  }

  const fileInput = page.locator('input[type="file"]#diary-photo-files');
  const inputCount = await fileInput.count();
  if (inputCount !== 1) throw new Error(`魂セラピストの写真の選択欄を特定できません（${inputCount}件）`);
  await fileInput.setInputFiles(photo);

  // 切り抜き画面が開き、「追加する」が押せるようになるまで待つ
  const modal = page.locator("#photo-crop-modal");
  const confirm = modal.locator('button[type="button"][data-crop-confirm]');
  let deadline = Date.now() + timeoutMs;
  let confirmReady = false;
  while (!confirmReady) {
    const state = await inspectEstamaDiarySlotState(form);
    if (state.error) throw new Error(`魂セラピストが写真を受け付けませんでした（${state.error}）`);
    confirmReady = await modal.isVisible().catch(() => false)
      && await confirm.count() === 1
      && await confirm.isEnabled().catch(() => false);
    if (confirmReady) break;
    if (Date.now() >= deadline) throw new Error("魂セラピストの画像切り取り画面を準備できません");
    await sleep(page, pollIntervalMs);
  }
  const label = (await confirm.innerText()).replace(/\s+/g, " ").trim();
  if (!/追加/.test(label)) throw new Error(`魂セラピストの画像切り取りのボタンが想定と異なります（${label.slice(0, 20)}）`);
  await confirm.click({ timeout: timeoutMs });

  deadline = Date.now() + timeoutMs;
  let finalState = await inspectEstamaDiarySlotState(form);
  for (;;) {
    const modalVisible = await modal.isVisible().catch(() => false);
    if (!modalVisible && isEstamaDiarySlotPhotoReady(finalState, 1)) break;
    if (finalState.error) throw new Error(`魂セラピストが写真を受け付けませんでした（${finalState.error}）`);
    if (Date.now() >= deadline) {
      console.log(JSON.stringify({ event: "estama_diary_slot_photo_incomplete", modalVisible, ...finalState }));
      throw new Error("魂セラピストの画像切り取りを完了できません");
    }
    await sleep(page, pollIntervalMs);
    finalState = await inspectEstamaDiarySlotState(form);
  }
  console.log(JSON.stringify({ event: "estama_diary_slot_photo_attached", ...finalState }));
  return finalState;
}
