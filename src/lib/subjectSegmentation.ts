// 写真の人（被写体）を自動で見分けて、背景ぼかし用のマスクを作る。
// MediaPipe の人の切り抜きモデル（selfie_segmenter・約250KB）をブラウザの中だけで動かす（写真は外に送らない）。
// 髪・服まで分ける selfie_multiclass（16MB）も試したが、仕上がりはほぼ同じでスマホの通信が重いのでこちらにした。
// 仕組みのファイル（wasm）とモデルは、初めて使うときに CDN から読む。

const TASKS_VISION_VERSION = "0.10.35";
const WASM_BASE = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${TASKS_VISION_VERSION}/wasm`;
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite";

/** 見分けるときの写真の長い辺（大きいと遅いだけで、細かさは変わらない） */
const SEGMENT_EDGE = 1024;

type Segmenter = {
  segment: (image: HTMLCanvasElement) => {
    confidenceMasks?: { width: number; height: number; getAsFloat32Array: () => Float32Array }[];
    close: () => void;
  };
};

let segmenterPromise: Promise<Segmenter> | null = null;

async function loadSegmenter(): Promise<Segmenter> {
  const { FilesetResolver, ImageSegmenter } = await import("@mediapipe/tasks-vision");
  const fileset = await FilesetResolver.forVisionTasks(WASM_BASE);
  const create = (delegate: "GPU" | "CPU") =>
    ImageSegmenter.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: MODEL_URL, delegate },
      runningMode: "IMAGE",
      outputCategoryMask: false,
      outputConfidenceMasks: true,
    });
  try {
    return (await create("GPU")) as unknown as Segmenter;
  } catch {
    return (await create("CPU")) as unknown as Segmenter;
  }
}

/** 人の確からしさ（0〜1）から、人の部分ほど不透明なマスクの画素を作る */
export function personAlpha(personConfidence: Float32Array): Uint8ClampedArray {
  const out = new Uint8ClampedArray(personConfidence.length * 4);
  for (let i = 0; i < personConfidence.length; i++) {
    const person = personConfidence[i];
    // ふちの迷いは少し人側に寄せて、髪の毛先が背景ぼかしに負けないようにする
    const a = Math.min(1, Math.max(0, (person - 0.25) / 0.5));
    out[i * 4 + 3] = Math.round(a * 255);
  }
  return out;
}

/**
 * 写真の人を見分けて、元の写真と同じ大きさのマスク（人＝不透明、背景＝透明）を返す。
 * 加工の回転・切り抜きはマスクにも同じようにかけるので、ここでは元の向きのまま作る。
 */
export async function detectSubjectMask(image: HTMLImageElement): Promise<HTMLCanvasElement> {
  segmenterPromise ??= loadSegmenter().catch((error) => {
    segmenterPromise = null;
    throw error;
  });
  const segmenter = await segmenterPromise;

  const iw = image.naturalWidth;
  const ih = image.naturalHeight;
  const scale = Math.min(1, SEGMENT_EDGE / Math.max(iw, ih));
  const input = document.createElement("canvas");
  input.width = Math.max(1, Math.round(iw * scale));
  input.height = Math.max(1, Math.round(ih * scale));
  input.getContext("2d")?.drawImage(image, 0, 0, input.width, input.height);

  const result = segmenter.segment(input);
  try {
    const masks = result.confidenceMasks ?? [];
    const background = masks[0];
    if (!background) throw new Error("人を見分けられませんでした");
    // selfie_segmenter はマスク1枚＝人の確からしさ。複数あるモデル（multiclass）は1枚目が背景
    const values = background.getAsFloat32Array();
    const person = masks.length === 1 ? values : values.map((v) => 1 - v);
    const small = document.createElement("canvas");
    small.width = background.width;
    small.height = background.height;
    const sctx = small.getContext("2d");
    if (!sctx) throw new Error("人を見分けられませんでした");
    sctx.putImageData(new ImageData(personAlpha(person), background.width, background.height), 0, 0);

    // 元の写真の大きさに広げる（なめらかに広げてふちを自然に）
    const mask = document.createElement("canvas");
    mask.width = iw;
    mask.height = ih;
    const mctx = mask.getContext("2d");
    if (!mctx) throw new Error("人を見分けられませんでした");
    mctx.imageSmoothingEnabled = true;
    mctx.imageSmoothingQuality = "high";
    mctx.drawImage(small, 0, 0, iw, ih);
    return mask;
  } finally {
    result.close();
  }
}
