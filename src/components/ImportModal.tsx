import { useState, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Upload, Loader2, CheckCircle, AlertCircle, FileText } from "lucide-react";

// ─── CSV parse ───────────────────────────────────────────────
function parseCSVText(text: string): string[][] {
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

// ─── Parsers ─────────────────────────────────────────────────

function parseCastCSV(text: string): { name: string; is_active: boolean }[] {
  // folders from zip: already handled elsewhere — this is for future CSV export
  // For now: single column "名前"
  const rows = parseCSVText(text);
  if (!rows.length) return [];
  const headers = rows[0];
  return rows.slice(1)
    .filter((r) => r.some((c) => c.trim()))
    .map((r) => ({ name: getCol(r, headers, "名前") || r[0], is_active: true }))
    .filter((r) => r.name);
}

function parseCustomerCSV(text: string) {
  const rows = parseCSVText(text);
  if (!rows.length) return [];
  const headers = rows[0];
  return rows.slice(1)
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

function parseReservationCSV(text: string, castMap: Map<string, string>) {
  const rows = parseCSVText(text);
  if (!rows.length) return [];
  const headers = rows[0];

  const parsePrice = (s: string) => parseInt(s.replace(/[¥,\s]/g, "") || "0", 10) || 0;
  const parseDur = (c: string) => { const m = c.match(/(\d+)分/); return m ? parseInt(m[1]) : 60; };
  const parseDate = (s: string) => {
    const m = s.match(/^(\d+)\/(\d+)\s*[月火水木金土日]?\s*(\d+):(\d+)/);
    if (!m) return null;
    const mo = parseInt(m[1]), d = parseInt(m[2]), h = parseInt(m[3]), mi = parseInt(m[4]);
    const yr = mo >= 10 ? 2025 : 2026;
    return { date: `${yr}-${String(mo).padStart(2,"0")}-${String(d).padStart(2,"0")}`, time: `${String(h).padStart(2,"0")}:${String(mi).padStart(2,"0")}` };
  };
  const parseCast = (s: string) => {
    const name = s.trim().split(/\s+/)[0];
    if (["写真指名","本指名","講習"].includes(name)) return "";
    return name.replace(/^[？🌊🚢]+/, "");
  };
  const parseStatus = (s: string) => ({ "完了":"completed","キャンセル":"cancelled","予約確定":"confirmed","新規予約":"pending" }[s] || "pending");
  const parsePay = (s: string) => ({ "現金":"cash","カード":"card","PayPay":"paypay" }[s] || null);

  return rows.slice(1)
    .filter((r) => r.some((c) => c.trim()))
    .map((r) => {
      const d = parseDate(getCol(r, headers, "予約日"));
      if (!d) return null;
      const castName = parseCast(getCol(r, headers, "キャスト"));
      return {
        reservation_date: d.date,
        start_time: d.time,
        customer_name: getCol(r, headers, "予約名"),
        cast_id: castName ? (castMap.get(castName) || null) : null,
        course_name: getCol(r, headers, "コース"),
        duration: parseDur(getCol(r, headers, "コース")),
        room: getCol(r, headers, "ルーム") || null,
        price: parsePrice(getCol(r, headers, "売上")),
        therapist_back: parsePrice(getCol(r, headers, "報酬")) || null,
        payment_method: parsePay(getCol(r, headers, "決済")),
        status: parseStatus(getCol(r, headers, "ステータス")),
        route: getCol(r, headers, "経路") || null,
      };
    })
    .filter(Boolean) as any[];
}

// ─── Generic insert with batching ────────────────────────────
async function batchInsert(table: string, rows: any[], onProgress: (n: number) => void) {
  const BATCH = 100;
  let count = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const { error } = await supabase.from(table as any).insert(rows.slice(i, i + BATCH));
    if (error) throw error;
    count += Math.min(BATCH, rows.length - i);
    onProgress(count);
  }
  return count;
}

// ─── Props ────────────────────────────────────────────────────
interface ImportModalProps {
  open: boolean;
  onClose: () => void;
  type: "casts" | "customers" | "reservations";
  onSuccess?: () => void;
}

const LABELS = {
  casts:        { title: "キャストCSVインポート",   hint: "casts_all.csv" },
  customers:    { title: "顧客CSVインポート",        hint: "customers_all.csv" },
  reservations: { title: "予約CSVインポート",        hint: "reservations_all.csv" },
};

export function ImportModal({ open, onClose, type, onSuccess }: ImportModalProps) {
  const [fileName, setFileName] = useState("");
  const [parsed, setParsed] = useState<any[]>([]);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [done, setDone] = useState(false);
  const [castMap, setCastMap] = useState<Map<string, string>>(new Map());
  const fileRef = useRef<HTMLInputElement>(null);

  const reset = () => { setFileName(""); setParsed([]); setProgress(0); setDone(false); };

  const handleOpen = async (isOpen: boolean) => {
    if (!isOpen) { onClose(); reset(); return; }
    if (type === "reservations") {
      const { data } = await supabase.from("casts").select("id, name");
      const m = new Map<string, string>();
      (data || []).forEach((c: any) => m.set(c.name, c.id));
      setCastMap(m);
    }
  };

  const handleFile = (file: File) => {
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      let rows: any[] = [];
      if (type === "casts") rows = parseCastCSV(text);
      else if (type === "customers") rows = parseCustomerCSV(text);
      else rows = parseReservationCSV(text, castMap);
      setParsed(rows);
    };
    reader.readAsText(file, "utf-8");
  };

  const handleImport = async () => {
    setImporting(true);
    try {
      const count = await batchInsert(type, parsed, setProgress);
      toast.success(`${count}件をインポートしました`);
      setDone(true);
      onSuccess?.();
    } catch (e: any) {
      toast.error(`エラー: ${e.message}`);
    } finally {
      setImporting(false);
    }
  };

  const label = LABELS[type];

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{label.title}</DialogTitle>
        </DialogHeader>

        {/* Drop zone */}
        <div
          className="border-2 border-dashed border-border rounded-lg p-8 text-center cursor-pointer hover:bg-muted/30 transition-colors"
          onClick={() => fileRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
        >
          <Upload size={28} className="mx-auto mb-2 text-muted-foreground" />
          {fileName ? (
            <div className="flex items-center justify-center gap-2">
              <FileText size={15} className="text-primary" />
              <span className="font-medium text-primary text-sm">{fileName}</span>
            </div>
          ) : (
            <>
              <p className="font-medium text-sm">CSVをドロップ、またはクリックして選択</p>
              <p className="text-xs text-muted-foreground mt-1">{label.hint}</p>
            </>
          )}
          <input ref={fileRef} type="file" accept=".csv" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
        </div>

        {parsed.length > 0 && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 p-3 bg-muted/40 rounded-lg">
              <span className="text-2xl font-bold">{parsed.length}</span>
              <span className="text-sm text-muted-foreground">件を読み込みました</span>
              {type === "reservations" && (
                <>
                  <span className="text-sm text-green-700 ml-auto">
                    キャスト紐付け: {parsed.filter((r) => r.cast_id).length}件
                  </span>
                  {parsed.filter((r) => !r.cast_id && r.customer_name).length > 0 && (
                    <span className="text-sm text-orange-600">
                      未紐付け: {parsed.filter((r) => !r.cast_id).length}件
                    </span>
                  )}
                </>
              )}
              {type === "customers" && (
                <div className="flex gap-3 ml-auto text-xs">
                  <span className="text-green-700">良好: {parsed.filter((r) => r.status === "active").length}</span>
                  <span className="text-orange-600">要注意: {parsed.filter((r) => r.status === "caution").length}</span>
                  <span className="text-red-600">出禁: {parsed.filter((r) => r.status === "banned").length}</span>
                </div>
              )}
            </div>

            {done ? (
              <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg">
                <CheckCircle size={18} className="text-green-600" />
                <span className="text-green-800 font-medium text-sm">{progress}件のインポートが完了しました</span>
              </div>
            ) : (
              <Button className="w-full" size="lg" onClick={handleImport} disabled={importing}>
                {importing
                  ? <><Loader2 size={15} className="mr-2 animate-spin" />インポート中... ({progress}/{parsed.length})</>
                  : `${parsed.length}件をインポートする`}
              </Button>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
