// 設定ダッシュボードの「ALL」（正本）を1枚の画像・PDFにして保存する。
// 外部ライブラリは使わず、canvas に表を描いて PNG にし、PDF は JPEG を A4 縦のページに切って並べる（buildImagePdf）。

export interface SheetSection {
  title: string;
  headers: string[];
  /** 列ごとの寄せ（既定は1列目が左・ほかは右） */
  align?: Array<"left" | "right">;
  /** 強調する列（バックなど、赤の太字） */
  accentColumn?: number;
  rows: string[][];
  note?: string;
}

export interface SheetDocument {
  title: string;
  subtitle: string;
  sections: SheetSection[];
}

const FONT = '"Hiragino Sans", "Hiragino Kaku Gothic ProN", "Noto Sans JP", "Yu Gothic", sans-serif';
const WIDTH = 900;
const PAD = 36;
const ROW_H = 40;
const HEAD_H = 34;
const ACCENT = "#e11d48";

/** 列の幅（1列目が残りの幅、ほかは均等） */
export function sheetColumnWidths(columnCount: number, innerWidth: number): number[] {
  if (columnCount <= 1) return [innerWidth];
  const other = Math.min(150, Math.floor((innerWidth * 0.55) / (columnCount - 1)));
  return [innerWidth - other * (columnCount - 1), ...Array.from({ length: columnCount - 1 }, () => other)];
}

/** 描く高さ（テストと canvas の大きさに使う） */
export function sheetHeight(doc: SheetDocument): number {
  let height = PAD + 40 + 26 + 18;
  for (const section of doc.sections) {
    height += 34 + HEAD_H + section.rows.length * ROW_H + (section.rows.length === 0 ? ROW_H : 0) + (section.note ? 24 : 0) + 22;
  }
  return height + PAD;
}

function fitText(ctx: CanvasRenderingContext2D, text: string, max: number): string {
  if (ctx.measureText(text).width <= max) return text;
  let out = text;
  while (out.length > 1 && ctx.measureText(`${out}…`).width > max) out = out.slice(0, -1);
  return `${out}…`;
}

/** 正本を canvas に描く（scale=2 で高精細） */
export function renderRateSheet(doc: SheetDocument, scale = 2): HTMLCanvasElement {
  const height = sheetHeight(doc);
  const canvas = document.createElement("canvas");
  canvas.width = WIDTH * scale;
  canvas.height = height * scale;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("画像を作れませんでした");
  ctx.scale(scale, scale);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, WIDTH, height);
  ctx.textBaseline = "middle";

  let y = PAD;
  ctx.fillStyle = "#111827";
  ctx.font = `bold 26px ${FONT}`;
  ctx.fillText(doc.title, PAD, y + 16);
  y += 40;
  ctx.fillStyle = "#6b7280";
  ctx.font = `14px ${FONT}`;
  ctx.fillText(doc.subtitle, PAD, y + 8);
  y += 26 + 18;

  const inner = WIDTH - PAD * 2;
  for (const section of doc.sections) {
    ctx.fillStyle = "#111827";
    ctx.font = `bold 18px ${FONT}`;
    ctx.fillText(section.title, PAD, y + 14);
    y += 34;

    const widths = sheetColumnWidths(section.headers.length, inner);
    const align = section.headers.map((_, index) => section.align?.[index] ?? (index === 0 ? "left" : "right"));
    const tableTop = y;
    const tableHeight = HEAD_H + Math.max(section.rows.length, 1) * ROW_H;

    ctx.fillStyle = "#f3f4f6";
    ctx.fillRect(PAD, y, inner, HEAD_H);
    let x = PAD;
    ctx.font = `bold 13px ${FONT}`;
    section.headers.forEach((header, index) => {
      ctx.fillStyle = index === section.accentColumn ? ACCENT : "#6b7280";
      ctx.textAlign = align[index] === "right" ? "right" : "left";
      ctx.fillText(header, align[index] === "right" ? x + widths[index] - 14 : x + 14, y + HEAD_H / 2);
      x += widths[index];
    });
    y += HEAD_H;

    if (section.rows.length === 0) {
      ctx.textAlign = "left";
      ctx.fillStyle = "#9ca3af";
      ctx.font = `14px ${FONT}`;
      ctx.fillText("なし", PAD + 14, y + ROW_H / 2);
      y += ROW_H;
    }
    for (const row of section.rows) {
      ctx.strokeStyle = "#e5e7eb";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(PAD, y + 0.5);
      ctx.lineTo(PAD + inner, y + 0.5);
      ctx.stroke();
      x = PAD;
      row.forEach((cell, index) => {
        const accent = index === section.accentColumn;
        ctx.font = `${accent ? "bold " : ""}15px ${FONT}`;
        ctx.fillStyle = accent ? ACCENT : index === 0 ? "#111827" : "#4b5563";
        ctx.textAlign = align[index] === "right" ? "right" : "left";
        const text = fitText(ctx, cell, widths[index] - 24);
        ctx.fillText(text, align[index] === "right" ? x + widths[index] - 14 : x + 14, y + ROW_H / 2);
        x += widths[index];
      });
      y += ROW_H;
    }
    ctx.textAlign = "left";
    ctx.strokeStyle = "#d1d5db";
    ctx.lineWidth = 1;
    ctx.strokeRect(PAD + 0.5, tableTop + 0.5, inner - 1, tableHeight - 1);

    if (section.note) {
      ctx.fillStyle = "#6b7280";
      ctx.font = `12px ${FONT}`;
      ctx.fillText(fitText(ctx, section.note, inner), PAD, y + 14);
      y += 24;
    }
    y += 22;
  }
  return canvas;
}

// ───────── PDF（画像をページに並べるだけの最小限の作り） ─────────

export interface PdfImagePage {
  /** JPEG のバイト列 */
  jpeg: Uint8Array;
  /** 画像の画素数 */
  width: number;
  height: number;
}

const A4_WIDTH_PT = 595.28;
const A4_HEIGHT_PT = 841.89;

/** JPEG の画像を1枚ずつ A4 縦のページに（幅いっぱい・上寄せ）並べた PDF を作る */
export function buildImagePdf(pages: PdfImagePage[]): Uint8Array {
  const encoder = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const offsets: number[] = [];
  let length = 0;
  const push = (data: Uint8Array | string) => {
    const bytes = typeof data === "string" ? encoder.encode(data) : data;
    chunks.push(bytes);
    length += bytes.length;
  };
  const startObject = (id: number) => {
    offsets[id] = length;
    push(`${id} 0 obj\n`);
  };

  push("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n");
  const pageIds = pages.map((_, index) => 3 + index * 3);
  startObject(1);
  push("<< /Type /Catalog /Pages 2 0 R >>\nendobj\n");
  startObject(2);
  push(`<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pages.length} >>\nendobj\n`);

  pages.forEach((page, index) => {
    const pageId = pageIds[index];
    const imageId = pageId + 1;
    const contentId = pageId + 2;
    const drawWidth = A4_WIDTH_PT;
    const drawHeight = (page.height / page.width) * A4_WIDTH_PT;
    const content = `q ${drawWidth.toFixed(2)} 0 0 ${drawHeight.toFixed(2)} 0 ${(A4_HEIGHT_PT - drawHeight).toFixed(2)} cm /Im${index} Do Q`;
    startObject(pageId);
    push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${A4_WIDTH_PT} ${A4_HEIGHT_PT}] /Resources << /XObject << /Im${index} ${imageId} 0 R >> >> /Contents ${contentId} 0 R >>\nendobj\n`);
    startObject(imageId);
    push(`<< /Type /XObject /Subtype /Image /Width ${page.width} /Height ${page.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${page.jpeg.length} >>\nstream\n`);
    push(page.jpeg);
    push("\nendstream\nendobj\n");
    startObject(contentId);
    push(`<< /Length ${encoder.encode(content).length} >>\nstream\n${content}\nendstream\nendobj\n`);
  });

  const objectCount = 2 + pages.length * 3;
  const xrefAt = length;
  push(`xref\n0 ${objectCount + 1}\n0000000000 65535 f \n`);
  for (let id = 1; id <= objectCount; id += 1) push(`${String(offsets[id]).padStart(10, "0")} 00000 n \n`);
  push(`trailer\n<< /Size ${objectCount + 1} /Root 1 0 R >>\nstartxref\n${xrefAt}\n%%EOF\n`);

  const out = new Uint8Array(length);
  let at = 0;
  for (const chunk of chunks) {
    out.set(chunk, at);
    at += chunk.length;
  }
  return out;
}

/** 画像の高さを A4 縦の1ページ分ずつに切る位置（画素） */
export function pdfPageSlices(width: number, height: number): Array<{ top: number; height: number }> {
  const pageHeight = Math.floor(width * (A4_HEIGHT_PT / A4_WIDTH_PT));
  const slices: Array<{ top: number; height: number }> = [];
  for (let top = 0; top < height; top += pageHeight) slices.push({ top, height: Math.min(pageHeight, height - top) });
  return slices;
}

async function canvasJpeg(canvas: HTMLCanvasElement): Promise<Uint8Array> {
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.92));
  if (!blob) throw new Error("PDFを作れませんでした");
  return new Uint8Array(await blob.arrayBuffer());
}

/** 描いた正本を A4 で切って PDF にする */
export async function rateSheetPdf(canvas: HTMLCanvasElement): Promise<Blob> {
  const pages: PdfImagePage[] = [];
  for (const slice of pdfPageSlices(canvas.width, canvas.height)) {
    const part = document.createElement("canvas");
    part.width = canvas.width;
    part.height = slice.height;
    const ctx = part.getContext("2d");
    if (!ctx) throw new Error("PDFを作れませんでした");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, part.width, part.height);
    ctx.drawImage(canvas, 0, slice.top, canvas.width, slice.height, 0, 0, canvas.width, slice.height);
    pages.push({ jpeg: await canvasJpeg(part), width: part.width, height: part.height });
  }
  return new Blob([buildImagePdf(pages)], { type: "application/pdf" });
}

/** ファイルとして保存（iPhone は共有シートが使えればそちらで「画像を保存」できる） */
export async function saveBlob(blob: Blob, filename: string) {
  const file = new File([blob], filename, { type: blob.type });
  const nav = navigator as Navigator & { canShare?: (data: { files: File[] }) => boolean };
  if (nav.canShare?.({ files: [file] }) && typeof nav.share === "function") {
    try {
      await nav.share({ files: [file], title: filename });
      return;
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export async function rateSheetPng(canvas: HTMLCanvasElement): Promise<Blob> {
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("画像を作れませんでした");
  return blob;
}
