// セラピストがマイページから送る写真を、ブラウザの中で 357×556（HP・エステ魂のパネル）に自動で切り抜く。
// 大きく切る写真（正方形・横長など）だけ、写っている人の位置を見分けて切る場所を決める（写真は外に送らない）。
// 見分けられない・時間がかかるときは真ん中寄り（縦長は上寄り）で切る。計算は panelPhotoCrop.ts。

import {
  PANEL_PHOTO_HEIGHT,
  PANEL_PHOTO_WIDTH,
  needsSubjectDetection,
  panelCropRect,
  subjectBoxFromConfidence,
  type SubjectBox,
} from "@/lib/panelPhotoCrop";
import { detectPersonConfidence } from "@/lib/subjectSegmentation";

/** 念のためお店に残す元の写真の長い辺 */
const ORIGINAL_MAX_EDGE = 2000;
/** 人の見分けを待つ時間（初回は仕組みの読み込みがあるので長め） */
const DETECT_TIMEOUT_MS = 10000;

export type PreparedPanelPhoto = {
  /** 357×556 に切り抜いた写真（JPEG の data URL） */
  panel: string;
  /** 元の写真（長い辺2000pxまでの JPEG の data URL） */
  original: string;
};

const loadFileImage = (file: File) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("画像を読み込めませんでした"));
    };
    img.src = objectUrl;
  });

const makeCanvas = (width: number, height: number) => {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("画像を読み込めませんでした");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  // 透明な部分（PNG）が黒くならないように白で塗っておく
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  return { canvas, ctx };
};

/** 大きな写真を一気に小さくすると Safari で粗くなるので、半分ずつ縮める */
function drawRegion(
  image: HTMLImageElement,
  region: { x: number; y: number; width: number; height: number },
  width: number,
  height: number,
): HTMLCanvasElement {
  let source: CanvasImageSource = image;
  let { x, y, width: sw, height: sh } = region;
  while (sw / 2 > width && sh / 2 > height) {
    const step = makeCanvas(sw / 2, sh / 2);
    step.ctx.drawImage(source, x, y, sw, sh, 0, 0, step.canvas.width, step.canvas.height);
    source = step.canvas;
    x = 0;
    y = 0;
    sw = step.canvas.width;
    sh = step.canvas.height;
  }
  const out = makeCanvas(width, height);
  out.ctx.drawImage(source, x, y, sw, sh, 0, 0, out.canvas.width, out.canvas.height);
  return out.canvas;
}

async function findSubject(image: HTMLImageElement): Promise<SubjectBox | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const detected = await Promise.race([
      detectPersonConfidence(image),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("timeout")), DETECT_TIMEOUT_MS);
      }),
    ]);
    return subjectBoxFromConfidence(detected.person, detected.width, detected.height);
  } catch (error) {
    console.warn("人の位置を見分けられなかったので真ん中で切り抜きます", error);
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** 写真を 357×556 に切り抜いたものと、元の写真（縮小）を作る */
export async function preparePanelPhoto(file: File): Promise<PreparedPanelPhoto> {
  const image = await loadFileImage(file);
  const size = { width: image.naturalWidth, height: image.naturalHeight };
  if (!size.width || !size.height) throw new Error("画像を読み込めませんでした");

  const subject = needsSubjectDetection(size) ? await findSubject(image) : null;
  const rect = panelCropRect(size, subject);
  const panel = drawRegion(image, rect, PANEL_PHOTO_WIDTH, PANEL_PHOTO_HEIGHT).toDataURL("image/jpeg", 0.9);

  const scale = Math.min(1, ORIGINAL_MAX_EDGE / Math.max(size.width, size.height));
  const original = drawRegion(
    image,
    { x: 0, y: 0, width: size.width, height: size.height },
    size.width * scale,
    size.height * scale,
  ).toDataURL("image/jpeg", 0.88);

  return { panel, original };
}
