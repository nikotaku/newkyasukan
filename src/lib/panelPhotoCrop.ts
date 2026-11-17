// セラピストから届いた写真を、HP・エステ魂のパネルと同じ 357×556 に自動で切り抜くための計算。
// 写真をなるべく大きく残し（拡大はしない）、人が写っている位置に合わせて切り抜く場所を決める。
// 画素の処理（canvas・人の見分け）は src/lib/panelPhotoAutoCrop.ts。

import { ESTAMA_CAST_PHOTO_HEIGHT, ESTAMA_CAST_PHOTO_WIDTH } from "./publicCastPhoto.ts";

export const PANEL_PHOTO_WIDTH = ESTAMA_CAST_PHOTO_WIDTH;
export const PANEL_PHOTO_HEIGHT = ESTAMA_CAST_PHOTO_HEIGHT;

/** 写っている人の範囲（写真の幅・高さに対する 0〜1） */
export type SubjectBox = {
  left: number;
  top: number;
  right: number;
  bottom: number;
  /** 人の部分の横方向の重心（体の中心。腕を広げていてもぶれにくい） */
  centerX: number;
};

export type CropRect = { x: number; y: number; width: number; height: number };

type Size = { width: number; height: number };

const PANEL: Size = { width: PANEL_PHOTO_WIDTH, height: PANEL_PHOTO_HEIGHT };

/** 頭の上に空ける余白（切り抜く高さに対する割合） */
const HEADROOM = 0.06;
/** 人が見つからないときに縦を切る位置（0 = 上を残す、0.5 = 真ん中）。顔は上のほうにあることが多い */
const FALLBACK_VERTICAL = 0.3;
/** 人の部分がこれより少なければ「写っていない」とみなす */
const MIN_SUBJECT_SHARE = 0.02;

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), Math.max(min, max));

/**
 * 切り抜きで写真の何割が残るか。1 に近いほどほぼそのまま（縦3:4の写真は約86%）。
 * 大きく切るときだけ人の位置を見分ければよい（見分ける仕組みはスマホで読み込みに時間がかかるため）。
 */
export function keptShare(source: Size, target: Size = PANEL): number {
  const sourceRatio = source.width / source.height;
  const targetRatio = target.width / target.height;
  return sourceRatio > targetRatio ? targetRatio / sourceRatio : sourceRatio / targetRatio;
}

export function needsSubjectDetection(source: Size, target: Size = PANEL): boolean {
  return keptShare(source, target) < 0.85;
}

/**
 * 写真のどこを切り抜くか（元の写真の画素で返す）。
 * - 横に長い写真：高さはそのまま、人の体の中心が真ん中に来るように左右を切る（人の範囲が収まるならはみ出さない）
 * - 縦に長い写真：幅はそのまま、頭の上に少し余白を残して上下を切る
 */
export function panelCropRect(source: Size, subject?: SubjectBox | null, target: Size = PANEL): CropRect {
  const sw = Math.max(1, source.width);
  const sh = Math.max(1, source.height);
  const ratio = target.width / target.height;

  if (sw / sh > ratio) {
    const width = sh * ratio;
    const maxX = sw - width;
    let x = (subject ? subject.centerX * sw : sw / 2) - width / 2;
    if (subject) {
      const left = subject.left * sw;
      const right = subject.right * sw;
      // 人の範囲が切り抜きに収まる大きさなら、端が切れないように寄せる
      if (right - left <= width) x = clamp(x, right - width, left);
    }
    return { x: clamp(x, 0, maxX), y: 0, width, height: sh };
  }

  const height = sw / ratio;
  const maxY = sh - height;
  let y = maxY * FALLBACK_VERTICAL;
  if (subject) {
    const top = subject.top * sh;
    const bottom = subject.bottom * sh;
    const headroom = height * HEADROOM;
    if (bottom - top + headroom <= height) {
      // 人の全身が入る：真ん中に置きつつ、頭の上の余白は必ず残す
      y = Math.min((top + bottom) / 2 - height / 2, top - headroom);
    } else {
      // 入りきらない：頭（上）を優先して残す
      y = top - headroom;
    }
  }
  return { x: 0, y: clamp(y, 0, maxY), width: sw, height };
}

/**
 * 人の確からしさ（0〜1、横 width × 縦 height の並び）から、人の範囲と体の中心を出す。
 * 人がほとんど写っていなければ null（そのときは真ん中寄りで切る）。
 */
export function subjectBoxFromConfidence(
  confidence: ArrayLike<number>,
  width: number,
  height: number,
  threshold = 0.5,
): SubjectBox | null {
  if (width <= 0 || height <= 0 || confidence.length < width * height) return null;
  const rowCounts = new Array<number>(height).fill(0);
  const colCounts = new Array<number>(width).fill(0);
  let total = 0;
  let sumX = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (confidence[y * width + x] < threshold) continue;
      rowCounts[y]++;
      colCounts[x]++;
      total++;
      sumX += x + 0.5;
    }
  }
  if (total < width * height * MIN_SUBJECT_SHARE) return null;

  // 小さなノイズ（背景のちょっとした誤判定）は範囲に入れない
  const rowMin = Math.max(1, Math.round(width * 0.01));
  const colMin = Math.max(1, Math.round(height * 0.01));
  const first = (counts: number[], min: number) => counts.findIndex((c) => c >= min);
  const last = (counts: number[], min: number) => {
    for (let i = counts.length - 1; i >= 0; i--) if (counts[i] >= min) return i;
    return -1;
  };
  const top = first(rowCounts, rowMin);
  const bottom = last(rowCounts, rowMin);
  const left = first(colCounts, colMin);
  const right = last(colCounts, colMin);
  if (top < 0 || left < 0) return null;

  return {
    left: left / width,
    top: top / height,
    right: (right + 1) / width,
    bottom: (bottom + 1) / height,
    centerX: sumX / total / width,
  };
}
