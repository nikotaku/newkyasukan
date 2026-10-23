// セラピスト写真の簡単な加工（切り抜き・回転・反転・明るさなど・顔隠しのハート／モザイク）。
// ブラウザの canvas だけで描く（Safari は ctx.filter が使えないので、色の調整は画素を直接いじる）。

export type PhotoAspect = "original" | "1:1" | "3:4" | "4:3" | "9:16";

export type PhotoOverlay = {
  kind: "heart" | "mosaic" | "glow";
  /** 切り抜いた枠の中の位置（0〜1） */
  x: number;
  y: number;
  /** 枠の幅に対する大きさ（0〜1） */
  size: number;
  /** 白ぼかしのキラキラの並び（動かしても変わらないように置いたときに決める） */
  seed?: number;
};

/**
 * 背景のモザイク・ぼかし。残す範囲は、auto＝写真の人を自動で見分けたマスク（renderEditedPhoto の subjectMask）、
 * ellipse＝keep の楕円（枠の中の位置 0〜1）の中
 */
export type PhotoBackground = {
  enabled: boolean;
  mode: "auto" | "ellipse";
  effect: "mosaic" | "blur";
  /** 1〜100 */
  strength: number;
  keep: { x: number; y: number; rx: number; ry: number };
};

export const defaultBackground = (): PhotoBackground => ({
  enabled: false,
  mode: "auto",
  effect: "mosaic",
  strength: 50,
  keep: { x: 0.5, y: 0.45, rx: 0.32, ry: 0.42 },
});

export type PhotoEditState = {
  rotation: 0 | 90 | 180 | 270;
  flipX: boolean;
  aspect: PhotoAspect;
  /** 1 = 枠いっぱい（はみ出しなし）、大きいほど寄る */
  zoom: number;
  /** 枠の幅・高さに対するずらし量（-0.5〜0.5 くらい） */
  offsetX: number;
  offsetY: number;
  /** -100〜100 */
  brightness: number;
  contrast: number;
  saturation: number;
  overlays: PhotoOverlay[];
  background: PhotoBackground;
};

export const initialPhotoEditState = (): PhotoEditState => ({
  rotation: 0,
  flipX: false,
  aspect: "original",
  zoom: 1,
  offsetX: 0,
  offsetY: 0,
  brightness: 0,
  contrast: 0,
  saturation: 0,
  overlays: [],
  background: defaultBackground(),
});

const ASPECTS: Record<Exclude<PhotoAspect, "original">, number> = {
  "1:1": 1,
  "3:4": 3 / 4,
  "4:3": 4 / 3,
  "9:16": 9 / 16,
};

/** 回転したあとの元画像の幅・高さ */
export function rotatedSize(width: number, height: number, rotation: PhotoEditState["rotation"]) {
  return rotation === 90 || rotation === 270 ? { width: height, height: width } : { width, height };
}

/** 出来上がりの枠の大きさ（長い辺を longEdge に合わせる） */
export function frameSize(
  imageWidth: number,
  imageHeight: number,
  state: Pick<PhotoEditState, "rotation" | "aspect">,
  longEdge: number,
) {
  const src = rotatedSize(imageWidth, imageHeight, state.rotation);
  const ratio = state.aspect === "original" ? src.width / src.height : ASPECTS[state.aspect];
  const maxEdge = Math.min(longEdge, Math.max(src.width, src.height));
  return ratio >= 1
    ? { width: Math.round(maxEdge), height: Math.round(maxEdge / ratio) }
    : { width: Math.round(maxEdge * ratio), height: Math.round(maxEdge) };
}

/** ずらし過ぎて枠に空白が出ないように、ずらし量の限度を返す */
export function offsetLimits(
  imageWidth: number,
  imageHeight: number,
  state: Pick<PhotoEditState, "rotation" | "aspect" | "zoom">,
) {
  const frame = frameSize(imageWidth, imageHeight, state, 1000);
  const src = rotatedSize(imageWidth, imageHeight, state.rotation);
  const scale = Math.max(frame.width / src.width, frame.height / src.height) * state.zoom;
  return {
    x: Math.max(0, (src.width * scale - frame.width) / 2 / frame.width),
    y: Math.max(0, (src.height * scale - frame.height) / 2 / frame.height),
  };
}

export function clampOffsets(image: { width: number; height: number }, state: PhotoEditState): PhotoEditState {
  const limit = offsetLimits(image.width, image.height, state);
  return {
    ...state,
    offsetX: Math.min(limit.x, Math.max(-limit.x, state.offsetX)),
    offsetY: Math.min(limit.y, Math.max(-limit.y, state.offsetY)),
  };
}

const clamp255 = (value: number) => (value < 0 ? 0 : value > 255 ? 255 : value);

/** 明るさ・コントラスト・彩度（-100〜100）を画素に当てる */
export function adjustPixels(data: Uint8ClampedArray, brightness: number, contrast: number, saturation: number) {
  if (!brightness && !contrast && !saturation) return;
  const b = brightness * 1.28; // ±128
  const c = contrast / 100;
  const contrastFactor = (1 + c) / (1 - Math.min(c, 0.99));
  const s = 1 + saturation / 100;
  for (let i = 0; i < data.length; i += 4) {
    let r = data[i] + b;
    let g = data[i + 1] + b;
    let bl = data[i + 2] + b;
    r = (r - 128) * contrastFactor + 128;
    g = (g - 128) * contrastFactor + 128;
    bl = (bl - 128) * contrastFactor + 128;
    const gray = 0.299 * r + 0.587 * g + 0.114 * bl;
    data[i] = clamp255(gray + (r - gray) * s);
    data[i + 1] = clamp255(gray + (g - gray) * s);
    data[i + 2] = clamp255(gray + (bl - gray) * s);
  }
}

/** 丸い範囲をモザイクにする（ブロックの平均色で塗る） */
function mosaic(ctx: CanvasRenderingContext2D, cx: number, cy: number, radius: number, block: number) {
  const x0 = Math.max(0, Math.floor(cx - radius));
  const y0 = Math.max(0, Math.floor(cy - radius));
  const x1 = Math.min(ctx.canvas.width, Math.ceil(cx + radius));
  const y1 = Math.min(ctx.canvas.height, Math.ceil(cy + radius));
  if (x1 <= x0 || y1 <= y0) return;
  const image = ctx.getImageData(x0, y0, x1 - x0, y1 - y0);
  const { data, width, height } = image;
  for (let by = 0; by < height; by += block) {
    for (let bx = 0; bx < width; bx += block) {
      const centerX = x0 + bx + block / 2 - cx;
      const centerY = y0 + by + block / 2 - cy;
      if (centerX * centerX + centerY * centerY > radius * radius) continue;
      let r = 0, g = 0, b = 0, n = 0;
      for (let y = by; y < Math.min(by + block, height); y += 1) {
        for (let x = bx; x < Math.min(bx + block, width); x += 1) {
          const i = (y * width + x) * 4;
          r += data[i]; g += data[i + 1]; b += data[i + 2]; n += 1;
        }
      }
      r /= n; g /= n; b /= n;
      for (let y = by; y < Math.min(by + block, height); y += 1) {
        for (let x = bx; x < Math.min(bx + block, width); x += 1) {
          const i = (y * width + x) * 4;
          data[i] = r; data[i + 1] = g; data[i + 2] = b;
        }
      }
    }
  }
  ctx.putImageData(image, x0, y0);
}

/** 位置から決まる乱数（画面で見た絵と保存した絵で、白ぼかしの粒が同じになるように） */
export function seededRandom(seed: number) {
  let t = (seed >>> 0) || 1;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

/** 0〜1 をなめらかにつなぐ（ふちに線が見えないように） */
function smoothstep(edge0: number, edge1: number, x: number) {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/** 白ぼかし（顔隠し）：まん中は白く、ふちに向かって線が見えないように少しずつ消え、まわりにキラキラした白い粒を散らす */
function glow(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number, seed: number) {
  const r = size / 2;
  // 白いところは r まで。ふちは r の外まで長く伸ばして、濃さを少しずつ落とす
  const outer = r * 1.35;
  ctx.save();
  const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, outer);
  const steps = 24;
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    const fade = 1 - smoothstep(0.35, 1, t);
    gradient.addColorStop(t, `rgba(255,255,255,${(Math.pow(fade, 1.2) * 0.98).toFixed(4)})`);
  }
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(cx, cy, outer, 0, Math.PI * 2);
  ctx.fill();

  // 粒：ふちのあたりに多く、外へ行くほど少なく・薄く（見本の写真のようなザラっとした白い粒）
  const random = seededRandom(seed);
  const count = Math.round(1100 + size * 6);
  const dot = Math.max(0.7, size / 200);
  for (let i = 0; i < count; i += 1) {
    const angle = random() * Math.PI * 2;
    const distance = r * (0.35 + Math.pow(random(), 0.75) * 1.35);
    const x = cx + Math.cos(angle) * distance;
    const y = cy + Math.sin(angle) * distance;
    const fade = 1 - smoothstep(r * 0.55, r * 1.7, distance);
    const alpha = (0.35 + random() * 0.65) * fade;
    if (alpha < 0.03) continue;
    ctx.fillStyle = `rgba(255,255,255,${Math.min(1, alpha).toFixed(3)})`;
    ctx.beginPath();
    ctx.arc(x, y, dot * (0.4 + random() * 1.1), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/** 白いハート（顔隠し用） */
function heart(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number) {
  const w = size;
  const h = size * 0.92;
  const top = cy - h * 0.42;
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.25)";
  ctx.shadowBlur = size * 0.08;
  ctx.fillStyle = "rgba(255,255,255,0.96)";
  ctx.beginPath();
  ctx.moveTo(cx, top + h * 0.28);
  ctx.bezierCurveTo(cx, top, cx - w * 0.5, top, cx - w * 0.5, top + h * 0.3);
  ctx.bezierCurveTo(cx - w * 0.5, top + h * 0.6, cx - w * 0.1, top + h * 0.78, cx, top + h);
  ctx.bezierCurveTo(cx + w * 0.1, top + h * 0.78, cx + w * 0.5, top + h * 0.6, cx + w * 0.5, top + h * 0.3);
  ctx.bezierCurveTo(cx + w * 0.5, top, cx, top, cx, top + h * 0.28);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/** 2点から楕円（中心・半径）を作る（指でなぞった範囲） */
export function ellipseFromDrag(a: { x: number; y: number }, b: { x: number; y: number }) {
  return {
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
    rx: Math.max(0.03, Math.abs(a.x - b.x) / 2),
    ry: Math.max(0.03, Math.abs(a.y - b.y) / 2),
  };
}

/** 背景用に、全体をモザイク／ぼかしにした絵を作る（Safari でも動くよう縮小→拡大で作る） */
function processedCopy(source: HTMLCanvasElement, effect: PhotoBackground["effect"], strength: number) {
  const { width, height } = source;
  const out = document.createElement("canvas");
  out.width = width;
  out.height = height;
  const ctx = out.getContext("2d");
  if (!ctx) return out;
  const small = document.createElement("canvas");
  if (effect === "mosaic") {
    const block = Math.max(4, Math.round((width / 120) * (0.4 + strength / 25)));
    small.width = Math.max(1, Math.round(width / block));
    small.height = Math.max(1, Math.round(height / block));
    const sctx = small.getContext("2d");
    if (!sctx) return out;
    sctx.imageSmoothingEnabled = true;
    sctx.drawImage(source, 0, 0, small.width, small.height);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(small, 0, 0, width, height);
    return out;
  }
  // ぼかし：小さくしてなめらかに戻すのを2回
  const factor = Math.max(2, Math.round(2 + strength / 6));
  small.width = Math.max(1, Math.round(width / factor));
  small.height = Math.max(1, Math.round(height / factor));
  const sctx = small.getContext("2d");
  if (!sctx) return out;
  sctx.imageSmoothingEnabled = true;
  sctx.imageSmoothingQuality = "high";
  sctx.drawImage(source, 0, 0, small.width, small.height);
  const tiny = document.createElement("canvas");
  tiny.width = Math.max(1, Math.round(small.width / 2));
  tiny.height = Math.max(1, Math.round(small.height / 2));
  const tctx = tiny.getContext("2d");
  if (tctx) {
    tctx.imageSmoothingEnabled = true;
    tctx.drawImage(small, 0, 0, tiny.width, tiny.height);
    sctx.clearRect(0, 0, small.width, small.height);
    sctx.drawImage(tiny, 0, 0, small.width, small.height);
  }
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(small, 0, 0, width, height);
  return out;
}

/** 背景をモザイク／ぼかしにし、人（自動）か楕円の中だけ元の絵を残す（ふちはなめらかにつなぐ） */
function applyBackground(ctx: CanvasRenderingContext2D, background: PhotoBackground, frameMask: HTMLCanvasElement | null) {
  const canvas = ctx.canvas;
  const { width, height } = canvas;
  const keep = document.createElement("canvas");
  keep.width = width;
  keep.height = height;
  const kctx = keep.getContext("2d");
  if (!kctx) return;
  kctx.drawImage(canvas, 0, 0);
  if (background.mode === "auto" && frameMask) {
    // 自動で見分けた人の形で残す
    kctx.globalCompositeOperation = "destination-in";
    kctx.drawImage(frameMask, 0, 0);
    const processed = processedCopy(canvas, background.effect, background.strength);
    ctx.clearRect(0, 0, width, height);
    ctx.drawImage(processed, 0, 0);
    ctx.drawImage(keep, 0, 0);
    return;
  }
  // 楕円の形の、ふちがぼけたマスク
  const cx = background.keep.x * width;
  const cy = background.keep.y * height;
  const rx = Math.max(1, background.keep.rx * width);
  const ry = Math.max(1, background.keep.ry * height);
  kctx.globalCompositeOperation = "destination-in";
  kctx.save();
  kctx.translate(cx, cy);
  kctx.scale(1, ry / rx);
  const gradient = kctx.createRadialGradient(0, 0, rx * 0.82, 0, 0, rx);
  gradient.addColorStop(0, "rgba(0,0,0,1)");
  gradient.addColorStop(1, "rgba(0,0,0,0)");
  kctx.fillStyle = gradient;
  kctx.beginPath();
  kctx.arc(0, 0, rx, 0, Math.PI * 2);
  kctx.fill();
  kctx.restore();

  const processed = processedCopy(canvas, background.effect, background.strength);
  ctx.clearRect(0, 0, width, height);
  ctx.drawImage(processed, 0, 0);
  ctx.drawImage(keep, 0, 0);
}

/** 加工した絵を canvas に描く。longEdge は出来上がりの長い辺の画素数 */
export function renderEditedPhoto(
  canvas: HTMLCanvasElement,
  image: HTMLImageElement,
  state: PhotoEditState,
  longEdge: number,
  options: { showGuides?: boolean; subjectMask?: HTMLCanvasElement | null; selectedOverlay?: number | null } = {},
) {
  const iw = image.naturalWidth;
  const ih = image.naturalHeight;
  const frame = frameSize(iw, ih, state, longEdge);
  canvas.width = frame.width;
  canvas.height = frame.height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("画像を描けませんでした");

  const src = rotatedSize(iw, ih, state.rotation);
  const scale = Math.max(frame.width / src.width, frame.height / src.height) * state.zoom;
  ctx.save();
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, frame.width, frame.height);
  ctx.translate(frame.width / 2 + state.offsetX * frame.width, frame.height / 2 + state.offsetY * frame.height);
  ctx.rotate((state.rotation * Math.PI) / 180);
  if (state.flipX) ctx.scale(-1, 1);
  ctx.scale(scale, scale);
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(image, -iw / 2, -ih / 2);
  ctx.restore();

  // 自動で見分けた人のマスクにも、写真と同じ回転・反転・ズーム・位置をかける
  let frameMask: HTMLCanvasElement | null = null;
  if (state.background.enabled && state.background.mode === "auto" && options.subjectMask) {
    frameMask = document.createElement("canvas");
    frameMask.width = frame.width;
    frameMask.height = frame.height;
    const mctx = frameMask.getContext("2d");
    if (mctx) {
      mctx.translate(frame.width / 2 + state.offsetX * frame.width, frame.height / 2 + state.offsetY * frame.height);
      mctx.rotate((state.rotation * Math.PI) / 180);
      if (state.flipX) mctx.scale(-1, 1);
      mctx.scale(scale, scale);
      mctx.imageSmoothingEnabled = true;
      mctx.imageSmoothingQuality = "high";
      mctx.drawImage(options.subjectMask, -iw / 2, -ih / 2, iw, ih);
    }
  }

  if (state.brightness || state.contrast || state.saturation) {
    const pixels = ctx.getImageData(0, 0, frame.width, frame.height);
    adjustPixels(pixels.data, state.brightness, state.contrast, state.saturation);
    ctx.putImageData(pixels, 0, 0);
  }

  if (state.background.enabled) applyBackground(ctx, state.background, frameMask);

  for (const overlay of state.overlays) {
    const cx = overlay.x * frame.width;
    const cy = overlay.y * frame.height;
    const size = overlay.size * frame.width;
    if (overlay.kind === "mosaic") {
      mosaic(ctx, cx, cy, size / 2, Math.max(4, Math.round(frame.width / 40)));
    } else if (overlay.kind === "glow") {
      glow(ctx, cx, cy, size, overlay.seed ?? Math.round(overlay.x * 100000) * 7919 + Math.round(overlay.y * 100000));
    } else {
      heart(ctx, cx, cy, size);
    }
  }

  // 画面で見るときだけ、選んでいる白ぼかし・ハート・モザイクを点線の円で囲む（保存する絵には描かない）
  const picked = options.showGuides && options.selectedOverlay != null ? state.overlays[options.selectedOverlay] : undefined;
  if (picked) {
    ctx.save();
    ctx.setLineDash([Math.max(4, frame.width / 90), Math.max(4, frame.width / 90)]);
    ctx.lineWidth = Math.max(2, frame.width / 300);
    ctx.strokeStyle = "rgba(236,72,153,0.95)";
    ctx.beginPath();
    ctx.arc(picked.x * frame.width, picked.y * frame.height, (picked.size * frame.width) / 2 + ctx.lineWidth * 2, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  // 画面で見るときだけ、残す範囲の楕円を点線で出す（保存する絵には描かない）
  if (options.showGuides && state.background.enabled && state.background.mode === "ellipse") {
    const { keep } = state.background;
    ctx.save();
    ctx.setLineDash([Math.max(4, frame.width / 80), Math.max(4, frame.width / 80)]);
    ctx.lineWidth = Math.max(2, frame.width / 300);
    ctx.strokeStyle = "rgba(255,255,255,0.95)";
    ctx.beginPath();
    ctx.ellipse(keep.x * frame.width, keep.y * frame.height, keep.rx * frame.width, keep.ry * frame.height, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
}

/** 保存用の JPEG（長い辺 2000px まで） */
export async function exportEditedPhoto(
  image: HTMLImageElement,
  state: PhotoEditState,
  subjectMask?: HTMLCanvasElement | null,
): Promise<Blob> {
  const canvas = document.createElement("canvas");
  renderEditedPhoto(canvas, image, state, 2000, { subjectMask });
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.9));
  if (!blob) throw new Error("画像を書き出せませんでした");
  return blob;
}

/** 加工用に画像を読み込む（保存先がCORSを許していないと加工できない） */
export function loadEditableImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("この写真は加工用に読み込めませんでした（保存先が外部の写真は加工できません）"));
    const sep = url.includes("?") ? "&" : "?";
    // ブラウザが CORS なしでキャッシュした絵を使わないように、加工用は別のURLで読む
    img.src = `${url}${sep}edit=1`;
  });
}
