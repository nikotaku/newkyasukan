import { format } from "date-fns";
import { ja } from "date-fns/locale";

export interface MonthlyReportData {
  month: Date;
  totalSales: number;
  therapistPaid: number;
  expensesTotal: number;
  netProfit: number;
  profitRate: number;
  cash: number;
  card: number;
  paypay: number;
  cashOnHand: number;
  cashRemaining: number;
  breakdown: { label: string; amount: number }[];
}

const FONT = '"Hiragino Sans", "Hiragino Kaku Gothic ProN", "Noto Sans JP", "Yu Gothic", sans-serif';
const yen = (v: number) => `¥${v.toLocaleString()}`;

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** 月次締めレポートをPNGで生成・共有/ダウンロード */
export function downloadMonthlyReport(data: MonthlyReportData): void {
  const scale = 2;
  const W = 600;
  const pad = 28;
  const contentW = W - pad * 2;

  // 高さ概算
  let H = pad + 34 + 26 + 16;         // タイトル+月+区切り
  H += 5 * 26 + 12;                    // 会計サマリー5行+区切り
  H += 44;                             // 純利益ハイライト
  H += 20 + 3 * 24 + 12;              // 支払方法別（見出し+3行）
  H += 20 + data.breakdown.length * 22 + 12; // 費目別
  H += 20 + 26 + 26;                   // 手元現金（投函合計＋実質残）
  H += 30 + pad;                       // フッター

  const canvas = document.createElement("canvas");
  canvas.width = W * scale;
  canvas.height = Math.ceil(H) * scale;
  const ctx = canvas.getContext("2d")!;
  ctx.scale(scale, scale);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, W, H);

  const ink = "#1f2937", muted = "#6b7280", primary = "#2563eb", line = "#e5e7eb", green = "#059669";
  const right = W - pad;
  let y = pad;

  ctx.fillStyle = ink;
  ctx.font = `bold 22px ${FONT}`;
  ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
  ctx.fillText("月次締めレポート", pad, y + 22);
  ctx.font = `14px ${FONT}`; ctx.fillStyle = muted; ctx.textAlign = "right";
  ctx.fillText(format(data.month, "yyyy年M月", { locale: ja }), right, y + 20);
  y += 34;
  ctx.textAlign = "left";
  ctx.strokeStyle = line; ctx.beginPath(); ctx.moveTo(pad, y + 10); ctx.lineTo(right, y + 10); ctx.stroke();
  y += 26;

  const row = (label: string, value: string, opts?: { color?: string; bold?: boolean; sign?: string }) => {
    ctx.font = `${opts?.bold ? "bold " : ""}14px ${FONT}`;
    ctx.fillStyle = opts?.color ?? ink;
    ctx.textAlign = "left"; ctx.fillText(label, pad, y + 18);
    ctx.textAlign = "right"; ctx.fillText((opts?.sign ?? "") + value, right, y + 18);
    ctx.textAlign = "left";
    y += 26;
  };

  row("売上", yen(data.totalSales));
  row("セラピスト給与（実支払）", yen(data.therapistPaid), { sign: "− " });
  row("販管費（経費合計）", yen(data.expensesTotal), { sign: "− " });
  ctx.strokeStyle = line; ctx.beginPath(); ctx.moveTo(pad, y + 4); ctx.lineTo(right, y + 4); ctx.stroke();
  y += 12;

  // 純利益ハイライト
  ctx.fillStyle = "#ecfdf5";
  roundRect(ctx, pad, y, contentW, 40, 8); ctx.fill();
  ctx.fillStyle = green; ctx.font = `bold 15px ${FONT}`; ctx.textAlign = "left";
  ctx.fillText("純利益", pad + 12, y + 26);
  ctx.font = `bold 20px ${FONT}`; ctx.textAlign = "right";
  ctx.fillText(`${yen(data.netProfit)}（${data.profitRate.toFixed(1)}%）`, right - 12, y + 27);
  ctx.textAlign = "left";
  y += 44;

  // 支払方法別
  ctx.fillStyle = muted; ctx.font = `bold 12px ${FONT}`;
  ctx.fillText("売上内訳（支払方法別）", pad, y + 14); y += 20;
  row("現金", yen(data.cash));
  row("カード", yen(data.card));
  row("PayPay", yen(data.paypay));
  ctx.strokeStyle = line; ctx.beginPath(); ctx.moveTo(pad, y + 0); ctx.lineTo(right, y + 0); ctx.stroke();
  y += 12;

  // 費目別
  ctx.fillStyle = muted; ctx.font = `bold 12px ${FONT}`;
  ctx.fillText("販管費 費目別内訳", pad, y + 14); y += 20;
  for (const b of data.breakdown) {
    ctx.font = `13px ${FONT}`; ctx.fillStyle = ink; ctx.textAlign = "left";
    ctx.fillText(b.label, pad, y + 16);
    ctx.textAlign = "right"; ctx.fillText(yen(b.amount), right, y + 16);
    ctx.textAlign = "left";
    y += 22;
  }
  ctx.strokeStyle = line; ctx.beginPath(); ctx.moveTo(pad, y + 2); ctx.lineTo(right, y + 2); ctx.stroke();
  y += 12;

  // 手元現金
  ctx.fillStyle = muted; ctx.font = `bold 12px ${FONT}`;
  ctx.fillText("手元現金", pad, y + 14); y += 20;
  ctx.font = `13px ${FONT}`; ctx.fillStyle = ink; ctx.textAlign = "left";
  ctx.fillText("投函合計", pad, y + 16);
  ctx.textAlign = "right"; ctx.fillText(yen(data.cashOnHand), right, y + 16);
  ctx.textAlign = "left"; y += 26;
  ctx.font = `bold 14px ${FONT}`; ctx.fillStyle = ink; ctx.textAlign = "left";
  ctx.fillText("実質手元現金（− 販管費）", pad, y + 16);
  ctx.fillStyle = primary; ctx.textAlign = "right"; ctx.font = `bold 16px ${FONT}`;
  ctx.fillText(yen(data.cashRemaining), right, y + 16);
  ctx.textAlign = "left"; y += 30;

  ctx.fillStyle = muted; ctx.font = `11px ${FONT}`; ctx.textAlign = "right";
  ctx.fillText(`発行日時 ${format(new Date(), "yyyy/MM/dd HH:mm")}`, right, y + 8);
  ctx.textAlign = "left";

  canvas.toBlob(async (blob) => {
    if (!blob) return;
    const fileName = `月次締めレポート_${format(data.month, "yyyyMM")}.png`;
    if (typeof navigator.canShare === "function") {
      const file = new File([blob], fileName, { type: "image/png" });
      if (navigator.canShare({ files: [file] })) {
        try { await navigator.share({ files: [file], title: `月次締め ${format(data.month, "yyyy年M月")}` }); return; }
        catch (e) { if ((e as Error).name === "AbortError") return; }
      }
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = fileName;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  }, "image/png");
}
