import { supabase } from "@/integrations/supabase/client";

export function parseCSVText(text: string): string[][] {
  const rows: string[][] = [];
  for (const line of text.replace(/^﻿/, "").split(/\r?\n/)) {
    if (!line.trim()) continue;
    const cols: string[] = [];
    let inQ = false, cur = "";
    for (const c of line) {
      if (c === '"') { inQ = !inQ; }
      else if (c === "," && !inQ) { cols.push(cur); cur = ""; }
      else { cur += c; }
    }
    cols.push(cur);
    rows.push(cols);
  }
  return rows;
}

function getCol(row: string[], headers: string[], name: string) {
  return (row[headers.indexOf(name)] || "").trim();
}

export function mapCustomerRows(headers: string[], dataRows: string[][]) {
  return dataRows
    .filter((r) => r.some((c) => c.trim()))
    .map((r) => {
      const phone = getCol(r, headers, "電話番号").replace(/^'/, "").replace(/[^\d]/g, "");
      if (!phone) return null;
      const ng = getCol(r, headers, "NG");
      const memo = getCol(r, headers, "メモ");
      const statusRaw = getCol(r, headers, "ステータス");
      const visitRaw = getCol(r, headers, "利用回数");
      return {
        name: getCol(r, headers, "名前") || phone,
        phone,
        email: getCol(r, headers, "Email") || null,
        visit_count: visitRaw ? parseInt(visitRaw, 10) : null,
        status: statusRaw === "出禁" ? "banned" : statusRaw === "要注意" ? "caution" : "active",
        notes: [memo, ng ? `NG: ${ng}` : ""].filter(Boolean).join(" / ") || null,
      };
    })
    .filter(Boolean) as any[];
}

export function mapReservationRows(headers: string[], dataRows: string[][], castMap: Map<string, string>) {
  const parsePrice = (s: string) => parseInt(s.replace(/[¥,\s]/g, "") || "0", 10) || 0;
  const parseDur = (c: string) => { const m = c.match(/(\d+)分/); return m ? parseInt(m[1]) : 60; };
  const parseDate = (s: string) => {
    const m = s.match(/^(\d+)\/(\d+)\s*[月火水木金土日]?\s*(\d+):(\d+)/);
    if (!m) return null;
    const mo = parseInt(m[1]), d = parseInt(m[2]), h = parseInt(m[3]), mi = parseInt(m[4]);
    const yr = mo >= 10 ? 2025 : 2026;
    const dt = new Date(yr, mo - 1, d, h, mi);
    const dd = dt.getDate(), dm = dt.getMonth() + 1, dy = dt.getFullYear();
    return {
      date: `${dy}-${String(dm).padStart(2,"0")}-${String(dd).padStart(2,"0")}`,
      time: `${String(dt.getHours()).padStart(2,"0")}:${String(dt.getMinutes()).padStart(2,"0")}`,
    };
  };
  const parseCast = (s: string) => {
    const name = s.trim().split(/\s+/)[0];
    if (["写真指名","本指名","講習"].includes(name)) return "";
    return name.replace(/^[？🌊🚢]+/, "");
  };
  const parseStatus = (s: string) => ({ "完了":"completed","キャンセル":"cancelled","予約確定":"confirmed","新規予約":"pending" }[s] || "pending");
  const parsePay = (s: string) => ({ "現金":"cash","カード":"card","PayPay":"paypay" }[s] || null);

  return dataRows
    .filter((r) => r.some((c) => c.trim()))
    .map((r) => {
      const d = parseDate(getCol(r, headers, "予約日"));
      if (!d) return null;
      const castName = parseCast(getCol(r, headers, "キャスト"));
      const route = getCol(r, headers, "経路");
      const notesBase = getCol(r, headers, "メモ") || getCol(r, headers, "備考");
      const noteParts = [notesBase, route ? `経路: ${route}` : ""].filter(Boolean);
      return {
        reservation_date: d.date,
        start_time: d.time,
        customer_name: getCol(r, headers, "予約名") || "不明",
        customer_phone: getCol(r, headers, "電話番号")?.replace(/^'/, "").replace(/[^\d]/g, "") || "",
        cast_id: castName ? (castMap.get(castName) || null) : null,
        course_name: getCol(r, headers, "コース") || "不明",
        duration: parseDur(getCol(r, headers, "コース")),
        room: getCol(r, headers, "ルーム") || null,
        price: parsePrice(getCol(r, headers, "売上")),
        payment_method: parsePay(getCol(r, headers, "決済")),
        status: parseStatus(getCol(r, headers, "ステータス")),
        notes: noteParts.join(" / ") || null,
      };
    })
    .filter((r) => r !== null) as any[];
}

export async function batchInsert(table: string, rows: any[], onProgress?: (n: number) => void) {
  const BATCH = 50;
  let count = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const { error } = await supabase.from(table as any).insert(rows.slice(i, i + BATCH));
    if (error) {
      const detail = [
        error.message,
        (error as any).code ? `Code: ${(error as any).code}` : "",
        (error as any).details ? `Details: ${(error as any).details}` : "",
        (error as any).hint ? `Hint: ${(error as any).hint}` : "",
      ].filter(Boolean).join(" | ");
      const err = new Error(detail);
      (err as any).raw = error;
      throw err;
    }
    count += Math.min(BATCH, rows.length - i);
    onProgress?.(count);
  }
  return count;
}
