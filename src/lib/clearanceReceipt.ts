import { format } from "date-fns";
import { ja } from "date-fns/locale";
import { toExtTime } from "./timeFormat";

export interface ReceiptReservation {
  start_time: string;
  customer_name: string;
  course_name: string;
  price: number;
  totalBack: number;
}

export interface ClearanceReceiptData {
  date: Date;
  castName: string;
  reservations: ReceiptReservation[];
  totalSales: number;
  therapistBack: number;
  miscExpenses: number;
  accommodationFee: number;
  salary: number;
  payout: number;
  payoutMethod: string;
}

const FONT = '"Hiragino Sans", "Hiragino Kaku Gothic ProN", "Noto Sans JP", "Yu Gothic", sans-serif';
const yen = (v: number) => `¥${v.toLocaleString()}`;

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const out: string[] = [];
  for (const para of text.split("\n")) {
    if (para === "") {
      out.push("");
      continue;
    }
    let line = "";
    for (const ch of para) {
      const test = line + ch;
      if (line && ctx.measureText(test).width > maxWidth) {
        out.push(line);
        line = ch;
      } else {
        line = test;
      }
    }
    if (line) out.push(line);
  }
  return out;
}

/**
 * 清算明細をPNG画像として生成しダウンロードする。
 * セラピストへLINE/SMS等で送付しやすいレシート形式。
 */
export function downloadClearanceReceipt(data: ClearanceReceiptData): void {
  const scale = 2;
  const W = 600;
  const pad = 28;
  const contentW = W - pad * 2;

  // 投函方法の折り返し行数を事前計測
  const measureCanvas = document.createElement("canvas");
  const mctx = measureCanvas.getContext("2d")!;
  mctx.font = `13px ${FONT}`;
  const methodLines = data.payoutMethod.trim()
    ? wrapText(mctx, data.payoutMethod.trim(), contentW)
    : [];

  // 高さ計算
  let H = pad;
  H += 32; // タイトル
  H += 22; // 日付
  H += 32; // セラピスト名
  H += 20; // 区切り
  H += 24; // テーブルヘッダ
  H += data.reservations.length * 46; // 予約行
  H += 16; // 区切り
  H += 5 * 26; // 売上・バック・雑費・宿泊費・給与
  H += 12; // 区切り
  H += 44; // 投函金額（大）
  if (methodLines.length > 0) {
    H += 16 + 20 + methodLines.length * 20; // 余白 + ラベル + 本文
  }
  H += 36; // フッター
  H += pad;

  const canvas = document.createElement("canvas");
  canvas.width = W * scale;
  canvas.height = Math.ceil(H) * scale;
  const ctx = canvas.getContext("2d")!;
  ctx.scale(scale, scale);

  // 背景
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, W, H);

  const ink = "#1f2937";
  const muted = "#6b7280";
  const primary = "#2563eb";
  const line = "#e5e7eb";

  const right = W - pad;
  let y = pad;

  // タイトル
  ctx.fillStyle = ink;
  ctx.font = `bold 22px ${FONT}`;
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillText("清算明細書", pad, y + 22);
  // 日付（右上）
  ctx.font = `13px ${FONT}`;
  ctx.fillStyle = muted;
  ctx.textAlign = "right";
  ctx.fillText(format(data.date, "yyyy年M月d日(E)", { locale: ja }), right, y + 20);
  y += 32;
  ctx.textAlign = "left";
  y += 22;

  // セラピスト名
  ctx.fillStyle = ink;
  ctx.font = `bold 18px ${FONT}`;
  ctx.fillText(`${data.castName} 様`, pad, y + 18);
  y += 32;

  // 区切り
  ctx.strokeStyle = line;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(pad, y + 8);
  ctx.lineTo(right, y + 8);
  ctx.stroke();
  y += 20;

  // テーブルヘッダ
  ctx.font = `12px ${FONT}`;
  ctx.fillStyle = muted;
  ctx.textAlign = "left";
  ctx.fillText("予約内容", pad, y + 16);
  ctx.textAlign = "right";
  ctx.fillText("料金 / バック", right, y + 16);
  ctx.textAlign = "left";
  y += 24;

  // 予約行
  for (const r of data.reservations) {
    // 1行目：時刻 顧客名 ・ コース
    ctx.fillStyle = ink;
    ctx.font = `bold 13px ${FONT}`;
    const timeStr = toExtTime(r.start_time);
    ctx.fillText(timeStr, pad, y + 16);
    const timeW = ctx.measureText(timeStr).width;
    ctx.font = `13px ${FONT}`;
    ctx.fillText(r.customer_name, pad + timeW + 10, y + 16);
    // コース（muted, 2行目左）
    ctx.fillStyle = muted;
    ctx.font = `11px ${FONT}`;
    ctx.fillText(r.course_name, pad, y + 34);
    // 料金（右1行目）
    ctx.fillStyle = ink;
    ctx.font = `bold 13px ${FONT}`;
    ctx.textAlign = "right";
    ctx.fillText(yen(r.price), right, y + 16);
    // バック（右2行目）
    ctx.fillStyle = muted;
    ctx.font = `11px ${FONT}`;
    ctx.fillText(`バック ${yen(r.totalBack)}`, right, y + 34);
    ctx.textAlign = "left";
    // 行区切り
    ctx.strokeStyle = "#f3f4f6";
    ctx.beginPath();
    ctx.moveTo(pad, y + 44);
    ctx.lineTo(right, y + 44);
    ctx.stroke();
    y += 46;
  }

  // 集計区切り
  ctx.strokeStyle = line;
  ctx.beginPath();
  ctx.moveTo(pad, y + 8);
  ctx.lineTo(right, y + 8);
  ctx.stroke();
  y += 16;

  const summaryRow = (label: string, value: string, opts?: { color?: string; bold?: boolean }) => {
    ctx.font = `${opts?.bold ? "bold " : ""}14px ${FONT}`;
    ctx.fillStyle = opts?.color ?? ink;
    ctx.textAlign = "left";
    ctx.fillText(label, pad, y + 18);
    ctx.textAlign = "right";
    ctx.fillText(value, right, y + 18);
    ctx.textAlign = "left";
    y += 26;
  };

  summaryRow("売上合計", yen(data.totalSales));
  summaryRow("給与バック", yen(data.therapistBack));
  summaryRow("雑費", `- ${yen(data.miscExpenses)}`);
  summaryRow("宿泊費", `- ${yen(data.accommodationFee)}`);
  summaryRow("セラピスト給与", yen(data.salary), { color: primary, bold: true });

  // 投函金額（強調）
  ctx.strokeStyle = line;
  ctx.beginPath();
  ctx.moveTo(pad, y + 6);
  ctx.lineTo(right, y + 6);
  ctx.stroke();
  y += 12;

  ctx.fillStyle = "#eff6ff";
  ctx.fillRect(pad, y, contentW, 38);
  ctx.fillStyle = ink;
  ctx.font = `bold 15px ${FONT}`;
  ctx.textAlign = "left";
  ctx.fillText("投函金額（店舗取り分）", pad + 10, y + 25);
  ctx.fillStyle = primary;
  ctx.font = `bold 19px ${FONT}`;
  ctx.textAlign = "right";
  ctx.fillText(yen(data.payout), right - 10, y + 26);
  ctx.textAlign = "left";
  y += 44;

  // 投函方法
  if (methodLines.length > 0) {
    y += 16;
    ctx.fillStyle = muted;
    ctx.font = `12px ${FONT}`;
    ctx.fillText("投函方法・アナウンス", pad, y + 14);
    y += 20;
    ctx.fillStyle = ink;
    ctx.font = `13px ${FONT}`;
    for (const ln of methodLines) {
      ctx.fillText(ln, pad, y + 14);
      y += 20;
    }
  }

  // フッター
  y += 16;
  ctx.fillStyle = muted;
  ctx.font = `11px ${FONT}`;
  ctx.textAlign = "right";
  ctx.fillText(`発行日時 ${format(new Date(), "yyyy/MM/dd HH:mm")}`, right, y + 12);
  ctx.textAlign = "left";

  canvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `清算明細_${data.castName}_${format(data.date, "yyyyMMdd")}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }, "image/png");
}
