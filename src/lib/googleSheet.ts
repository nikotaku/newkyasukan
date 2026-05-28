/** Google Sheets から CSV/JSON を取得するユーティリティ */

const LS_KEY = "gsheet_urls_v1";

export type GSheetSource = "reservations" | "customers" | "reports";

export function getStoredUrl(source: GSheetSource): string {
  try {
    return JSON.parse(localStorage.getItem(LS_KEY) || "{}")[source] || "";
  } catch {
    return "";
  }
}

export function saveUrl(source: GSheetSource, url: string) {
  try {
    const all = JSON.parse(localStorage.getItem(LS_KEY) || "{}");
    all[source] = url;
    localStorage.setItem(LS_KEY, JSON.stringify(all));
  } catch {}
}

/** URL からシート ID とオプションの gid を抽出 */
function extractSheetId(url: string): { sheetId: string; gid: string } | null {
  const m = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  if (!m) return null;
  const gidMatch = url.match(/[#&?]gid=(\d+)/);
  return { sheetId: m[1], gid: gidMatch?.[1] ?? "0" };
}

/**
 * Google Sheets gviz/tq JSON エンドポイントから行データを取得する。
 * 「リンクを知っている全員が閲覧可能」なシートで動作（ログイン不要）。
 */
export async function fetchSheetRows(
  rawUrl: string
): Promise<{ headers: string[]; rows: string[][] }> {
  const info = extractSheetId(rawUrl.trim());
  if (!info) throw new Error("Google Sheets の URL を入力してください");

  const gvizUrl =
    `https://docs.google.com/spreadsheets/d/${info.sheetId}/gviz/tq` +
    `?tqx=out:json&gid=${info.gid}`;

  const res = await fetch(gvizUrl);
  if (!res.ok) throw new Error(`HTTP ${res.status} — シートを取得できませんでした`);

  const text = await res.text();
  // gviz response is wrapped: /*O_o*/\ngoogle.visualization.Query.setResponse({...});
  // 改行を跨ぐので s フラグ必須
  const start = text.indexOf("(");
  const end = text.lastIndexOf(")");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("シートを読み込めませんでした。共有設定を確認してください。");
  }
  const jsonStr = text.slice(start + 1, end);
  const json = JSON.parse(jsonStr);

  if (json.status !== "ok") {
    throw new Error(
      json.errors?.[0]?.detailed_message ||
        "シートを読み込めませんでした。共有設定を確認してください。"
    );
  }

  const cols: string[] = json.table.cols.map((c: any) => c.label || c.id || "");
  const rows: string[][] = (json.table.rows || []).map((r: any) =>
    (r.c || []).map((cell: any) => {
      if (cell == null || cell.v == null) return "";
      // Date values come as "Date(2024,0,1)" → convert
      if (typeof cell.v === "string" && cell.v.startsWith("Date(")) {
        const parts = cell.v.match(/Date\((\d+),(\d+),(\d+)/);
        if (parts) {
          const y = parts[1];
          const m = String(parseInt(parts[2]) + 1).padStart(2, "0");
          const d = String(parts[3]).padStart(2, "0");
          return `${y}/${m}/${d}`;
        }
      }
      return cell.f ?? String(cell.v);
    })
  );

  return { headers: cols, rows };
}
