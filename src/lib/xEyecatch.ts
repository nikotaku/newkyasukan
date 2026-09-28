/**
 * X投稿用のアイキャッチ画像（1200×675）をブラウザのcanvasで作る。
 * セラピストの写真は CORS を許可している保存先（Supabase Storage）だけ描き、読めない写真は名前の頭文字で代わりにする
 * （他サイトの画像をそのまま描くとcanvasが書き出せなくなるため）。
 */
import { driveImgUrl } from "@/lib/drive";
import { dayLabel, shiftDate, type XCast, type XDailyPost, type XPostContext } from "@/lib/xDailyPosts";

export const EYECATCH_WIDTH = 1200;
export const EYECATCH_HEIGHT = 675;

const COLORS = {
  bg: "#150a11",
  card: "#241423",
  border: "#4a2740",
  accent: "#d4547a",
  accentLight: "#f2a0bc",
  text: "#f7e9f0",
  muted: "#b8949f",
  gold: "#d8b26a",
};

const SERIF = '"Hiragino Mincho ProN","Yu Mincho","Noto Serif JP","Noto Serif CJK JP",serif';
const SANS = '"Hiragino Sans","Hiragino Kaku Gothic ProN","Noto Sans JP","Noto Sans CJK JP",sans-serif';

type Ctx = CanvasRenderingContext2D;

function loadImage(url: string | null): Promise<HTMLImageElement | null> {
  if (!url) return Promise.resolve(null);
  return new Promise((resolve) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = driveImgUrl(url, 600);
    setTimeout(() => resolve(null), 8000);
  });
}

function roundRect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// 写真を枠いっぱいに（はみ出しは切る）。上寄せにして顔が切れにくいようにする
function drawPhoto(ctx: Ctx, image: HTMLImageElement | null, name: string, x: number, y: number, w: number, h: number, r = 16) {
  ctx.save();
  roundRect(ctx, x, y, w, h, r);
  ctx.clip();
  if (image) {
    const scale = Math.max(w / image.naturalWidth, h / image.naturalHeight);
    const dw = image.naturalWidth * scale;
    const dh = image.naturalHeight * scale;
    ctx.drawImage(image, x + (w - dw) / 2, y + Math.min(0, (h - dh) * 0.15), dw, dh);
  } else {
    const gradient = ctx.createLinearGradient(x, y, x + w, y + h);
    gradient.addColorStop(0, "#3a1d33");
    gradient.addColorStop(1, "#1f0f1b");
    ctx.fillStyle = gradient;
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = COLORS.accentLight;
    ctx.font = `600 ${Math.round(w * 0.36)}px ${SERIF}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(name.slice(0, 1), x + w / 2, y + h / 2);
  }
  ctx.restore();
  ctx.save();
  roundRect(ctx, x, y, w, h, r);
  ctx.strokeStyle = COLORS.border;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.restore();
}

// 日本語は1文字ずつ幅を測って折り返す
function wrapLines(ctx: Ctx, text: string, maxWidth: number, maxLines: number) {
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    let line = "";
    for (const char of paragraph) {
      if (ctx.measureText(line + char).width > maxWidth && line) {
        lines.push(line);
        line = char;
      } else {
        line += char;
      }
    }
    lines.push(line);
  }
  const trimmed = lines.filter((line, index) => line || (index > 0 && lines[index - 1]));
  if (trimmed.length <= maxLines) return trimmed;
  const shown = trimmed.slice(0, maxLines);
  let last = shown[maxLines - 1];
  while (last && ctx.measureText(`${last}…`).width > maxWidth) last = last.slice(0, -1);
  shown[maxLines - 1] = `${last}…`;
  return shown;
}

function fitFont(ctx: Ctx, text: string, weight: number, family: string, start: number, min: number, maxWidth: number) {
  for (let size = start; size >= min; size -= 2) {
    ctx.font = `${weight} ${size}px ${family}`;
    if (ctx.measureText(text).width <= maxWidth) return size;
  }
  ctx.font = `${weight} ${min}px ${family}`;
  return min;
}

function background(ctx: Ctx) {
  ctx.fillStyle = COLORS.bg;
  ctx.fillRect(0, 0, EYECATCH_WIDTH, EYECATCH_HEIGHT);
  const glow = ctx.createRadialGradient(EYECATCH_WIDTH * 0.85, -80, 40, EYECATCH_WIDTH * 0.85, -80, 700);
  glow.addColorStop(0, "rgba(212,84,122,0.35)");
  glow.addColorStop(1, "rgba(212,84,122,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, EYECATCH_WIDTH, EYECATCH_HEIGHT);
  ctx.strokeStyle = "rgba(216,178,106,0.45)";
  ctx.lineWidth = 2;
  ctx.strokeRect(24, 24, EYECATCH_WIDTH - 48, EYECATCH_HEIGHT - 48);
}

function header(ctx: Ctx, title: string, sub: string, storeName: string) {
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";
  ctx.fillStyle = COLORS.text;
  ctx.font = `700 60px ${SERIF}`;
  ctx.fillText(title, 72, 118);
  const titleWidth = ctx.measureText(title).width;
  ctx.fillStyle = COLORS.accentLight;
  ctx.font = `600 34px ${SANS}`;
  ctx.fillText(sub, 72 + titleWidth + 28, 114);
  ctx.textAlign = "right";
  ctx.fillStyle = COLORS.gold;
  ctx.font = `600 30px ${SERIF}`;
  ctx.fillText(storeName, EYECATCH_WIDTH - 72, 112);
  const line = ctx.createLinearGradient(72, 0, EYECATCH_WIDTH - 72, 0);
  line.addColorStop(0, COLORS.accent);
  line.addColorStop(1, "rgba(212,84,122,0)");
  ctx.fillStyle = line;
  ctx.fillRect(72, 140, EYECATCH_WIDTH - 144, 3);
}

function footer(ctx: Ctx, text: string) {
  ctx.textAlign = "right";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = COLORS.muted;
  ctx.font = `500 24px ${SANS}`;
  ctx.fillText(text, EYECATCH_WIDTH - 72, EYECATCH_HEIGHT - 52);
}

async function drawShift(ctx: Ctx, casts: XCast[], title: string, date: string, storeName: string, siteHost: string) {
  background(ctx);
  header(ctx, title, dayLabel(date), storeName);
  if (!casts.length) {
    ctx.textAlign = "center";
    ctx.fillStyle = COLORS.muted;
    ctx.font = `600 44px ${SANS}`;
    ctx.fillText("出勤情報は準備中です", EYECATCH_WIDTH / 2, 380);
    footer(ctx, siteHost);
    return;
  }
  const shown = casts.slice(0, 10);
  const columns = shown.length <= 5 ? shown.length : Math.ceil(shown.length / 2);
  const rows = shown.length <= 5 ? 1 : 2;
  const areaTop = 176;
  const areaHeight = EYECATCH_HEIGHT - areaTop - 96;
  const gap = 22;
  const labelHeight = 70;
  const cellHeight = (areaHeight - gap * (rows - 1)) / rows;
  const photoHeight = cellHeight - labelHeight;
  const photoWidth = Math.min(photoHeight * 0.75, (EYECATCH_WIDTH - 144 - gap * (columns - 1)) / columns);
  const totalWidth = photoWidth * columns + gap * (columns - 1);
  const left = (EYECATCH_WIDTH - totalWidth) / 2;
  const images = await Promise.all(shown.map((cast) => loadImage(cast.photo)));
  shown.forEach((cast, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    const x = left + column * (photoWidth + gap);
    const y = areaTop + row * (cellHeight + gap);
    drawPhoto(ctx, images[index], cast.name, x, y, photoWidth, photoHeight);
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = COLORS.text;
    fitFont(ctx, cast.name, 700, SANS, rows === 1 ? 32 : 26, 16, photoWidth + gap - 4);
    ctx.fillText(cast.name, x + photoWidth / 2, y + photoHeight + 34);
    ctx.fillStyle = COLORS.accentLight;
    ctx.font = `600 ${rows === 1 ? 24 : 20}px ${SANS}`;
    ctx.fillText(`${cast.start.slice(0, 5)}〜`, x + photoWidth / 2, y + photoHeight + (rows === 1 ? 64 : 58));
  });
  footer(ctx, casts.length > shown.length ? `ほか${casts.length - shown.length}名 ・ ${siteHost}` : siteHost);
}

async function drawPickup(ctx: Ctx, cast: XCast, storeName: string, siteHost: string, isToday: boolean) {
  background(ctx);
  const image = await loadImage(cast.photo);
  drawPhoto(ctx, image, cast.name, 72, 64, 410, 547, 20);
  const x = 540;
  const width = EYECATCH_WIDTH - x - 80;
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = COLORS.gold;
  ctx.font = `600 28px ${SERIF}`;
  ctx.fillText(`${storeName}｜${isToday ? "本日出勤" : "出勤"}`, x, 140);
  ctx.fillStyle = COLORS.text;
  fitFont(ctx, cast.name, 700, SERIF, 96, 48, width);
  ctx.fillText(cast.name, x, 250);
  if (cast.intro) {
    ctx.fillStyle = COLORS.text;
    ctx.font = `500 30px ${SANS}`;
    wrapLines(ctx, cast.intro, width, 4).forEach((line, index) => ctx.fillText(line, x, 320 + index * 46));
  } else {
    ctx.fillStyle = COLORS.accentLight;
    ctx.font = `600 40px ${SANS}`;
    ctx.fillText(`${isToday ? "本日 " : ""}${cast.start.slice(0, 5)}〜 出勤`, x, 340);
  }
  const time = cast.nextAvailable ?? cast.start.slice(0, 5);
  roundRect(ctx, x, 506, width, 84, 42);
  ctx.fillStyle = COLORS.accent;
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "center";
  ctx.font = `700 38px ${SANS}`;
  ctx.fillText(`${isToday ? "本日" : ""}${time}〜 ご案内可能`, x + width / 2, 562);
  footer(ctx, siteHost);
}

function drawSlots(ctx: Ctx, post: XDailyPost, context: XPostContext, storeName: string, siteHost: string) {
  background(ctx);
  const open = context.today.filter((c) => c.nextAvailable).sort((a, b) => a.nextAvailable!.localeCompare(b.nextAvailable!));
  const isLast = post.kind === "last_slot";
  header(ctx, isLast ? "本日ラスト枠" : open.length ? "空き枠速報" : "満員御礼", context.isToday ? `${context.nowLabel}時点` : dayLabel(context.date), storeName);
  if (!open.length) {
    ctx.textAlign = "center";
    ctx.fillStyle = COLORS.text;
    ctx.font = `700 52px ${SERIF}`;
    ctx.fillText("本日は全枠ご予約いただきました", EYECATCH_WIDTH / 2, 360);
    ctx.fillStyle = COLORS.accentLight;
    ctx.font = `600 34px ${SANS}`;
    ctx.fillText("明日のご予約はお早めに", EYECATCH_WIDTH / 2, 440);
    footer(ctx, siteHost);
    return;
  }
  // フッター（URL）に重ならないよう4行まで
  const rows = isLast ? open.slice(-1) : open.slice(0, 4);
  const rowHeight = isLast ? 200 : 82;
  const top = isLast ? 230 : 184;
  rows.forEach((cast, index) => {
    const y = top + index * (rowHeight + 12);
    roundRect(ctx, 72, y, EYECATCH_WIDTH - 144, rowHeight, 18);
    ctx.fillStyle = COLORS.card;
    ctx.fill();
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";
    ctx.fillStyle = COLORS.accentLight;
    ctx.font = `700 ${isLast ? 96 : 46}px ${SANS}`;
    ctx.fillText(`${cast.nextAvailable}〜`, 110, y + rowHeight / 2);
    ctx.textAlign = "right";
    ctx.fillStyle = COLORS.text;
    ctx.font = `700 ${isLast ? 64 : 40}px ${SANS}`;
    ctx.fillText(`${cast.name}さん`, EYECATCH_WIDTH - 110, y + rowHeight / 2);
  });
  if (open.length > rows.length && !isLast) {
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = COLORS.muted;
    ctx.font = `500 24px ${SANS}`;
    ctx.fillText(`ほか${open.length - rows.length}名もご案内可能`, 72, EYECATCH_HEIGHT - 52);
  }
  footer(ctx, siteHost);
}

function drawEvent(ctx: Ctx, context: XPostContext, storeName: string, siteHost: string) {
  background(ctx);
  const top = context.discounts[0];
  header(ctx, "開催中", "イベント・割引", storeName);
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = COLORS.text;
  ctx.font = `700 64px ${SERIF}`;
  const lines = wrapLines(ctx, top?.name ?? "", EYECATCH_WIDTH - 200, 2);
  lines.forEach((line, index) => ctx.fillText(line, EYECATCH_WIDTH / 2, 290 + index * 84));
  if (top?.label) {
    const labelWidth = Math.min(EYECATCH_WIDTH - 200, ctx.measureText(top.label).width + 120);
    roundRect(ctx, (EYECATCH_WIDTH - labelWidth) / 2, 440, labelWidth, 100, 50);
    ctx.fillStyle = COLORS.accent;
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    fitFont(ctx, top.label, 700, SANS, 48, 26, labelWidth - 60);
    ctx.textBaseline = "middle";
    ctx.fillText(top.label, EYECATCH_WIDTH / 2, 492);
  }
  footer(ctx, siteHost);
}

function drawQuote(ctx: Ctx, post: XDailyPost, text: string, storeName: string, siteHost: string) {
  background(ctx);
  header(ctx, post.type || "お知らせ", post.accountName, storeName);
  // URLは画像では読めないので外す
  const body = text.replace(/https?:\/\/\S+/g, "").replace(/▶︎\s*$/gm, "").replace(/\n{2,}/g, "\n").trim();
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = COLORS.text;
  ctx.font = `600 44px ${SANS}`;
  const lines = wrapLines(ctx, body, EYECATCH_WIDTH - 200, 7);
  const lineHeight = 62;
  const top = Math.max(220, 380 - (lines.length * lineHeight) / 2);
  ctx.fillStyle = COLORS.accent;
  ctx.fillRect(84, top - 44, 6, lines.length * lineHeight);
  ctx.fillStyle = COLORS.text;
  lines.forEach((line, index) => ctx.fillText(line, 112, top + index * lineHeight));
  footer(ctx, siteHost);
}

export async function renderEyecatch(post: XDailyPost, text: string, context: XPostContext): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = EYECATCH_WIDTH;
  canvas.height = EYECATCH_HEIGHT;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("画像を作れませんでした（このブラウザでは使えません）");
  if (document.fonts?.ready) await document.fonts.ready;
  const siteHost = context.siteUrl.replace(/^https?:\/\//, "");

  switch (post.imageKind) {
    case "shift_today":
      await drawShift(ctx, context.today, "本日の出勤", context.date, context.storeName, siteHost);
      break;
    case "shift_tomorrow":
      await drawShift(ctx, context.tomorrow, "明日の出勤", shiftDate(context.date, 1), context.storeName, siteHost);
      break;
    case "pickup":
      if (post.pickup) await drawPickup(ctx, post.pickup, context.storeName, siteHost, context.isToday);
      else drawQuote(ctx, post, text, context.storeName, siteHost);
      break;
    case "slots":
      drawSlots(ctx, post, context, context.storeName, siteHost);
      break;
    case "event":
      if (context.discounts.length) drawEvent(ctx, context, context.storeName, siteHost);
      else drawQuote(ctx, post, text, context.storeName, siteHost);
      break;
    default:
      drawQuote(ctx, post, text, context.storeName, siteHost);
  }

  return await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("画像を書き出せませんでした"))), "image/png"),
  );
}

// スマホでは共有シート（写真に保存・Xに添付）、PCではダウンロード
export async function shareOrDownloadImage(blob: Blob, filename: string) {
  const file = new File([blob], filename, { type: "image/png" });
  const nav = navigator as Navigator & { canShare?: (data: ShareData) => boolean };
  if (nav.canShare?.({ files: [file] }) && /iPhone|iPad|Android/i.test(navigator.userAgent)) {
    try {
      await nav.share({ files: [file] });
      return "shared";
    } catch (error) {
      if ((error as DOMException)?.name === "AbortError") return "cancelled";
    }
  }
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  return "downloaded";
}
