import { useState, useRef } from "react";
import { DashboardHeader } from "@/components/DashboardHeader";
import { Sidebar } from "@/components/Sidebar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Upload, Loader2, CheckCircle, AlertCircle, FileText } from "lucide-react";
import { useEffect } from "react";

interface ParsedRow {
  reservation_date: string;
  start_time: string;
  customer_name: string;
  cast_name: string;
  cast_id: string | null;
  course: string;
  duration: number;
  room: string;
  price: number;
  therapist_back: number;
  payment_method: string | null;
  status: string;
  route: string;
}

function parsePrice(s: string): number {
  if (!s) return 0;
  return parseInt(s.replace(/[¥,\s]/g, "") || "0", 10);
}

function parseDuration(course: string): number {
  const m = course.match(/(\d+)分/);
  return m ? parseInt(m[1], 10) : 60;
}

function parseDate(s: string): { date: string; time: string } | null {
  const m = s.trim().match(/^(\d+)\/(\d+)\s*[月火水木金土日]?\s*(\d+):(\d+)/);
  if (!m) return null;
  const month = parseInt(m[1], 10);
  const day = parseInt(m[2], 10);
  const hour = parseInt(m[3], 10);
  const minute = parseInt(m[4], 10);
  const year = month >= 10 ? 2025 : 2026;
  return {
    date: `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
    time: `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`,
  };
}

function parseCastName(s: string): string {
  if (!s) return "";
  const parts = s.trim().split(/\s+/);
  const name = parts[0];
  // skip if it's a nomination-only entry
  if (["写真指名", "本指名", "講習"].includes(name)) return "";
  // strip leading special chars
  return name.replace(/^[？🌊🚢]+/, "");
}

function parseStatus(s: string): string {
  switch (s) {
    case "完了": return "completed";
    case "キャンセル": return "cancelled";
    case "予約確定": return "confirmed";
    case "新規予約": return "pending";
    default: return "pending";
  }
}

function parsePayment(s: string): string | null {
  switch (s) {
    case "現金": return "cash";
    case "カード": return "card";
    case "PayPay": return "paypay";
    default: return null;
  }
}

function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    if (!line.trim()) continue;
    const cols: string[] = [];
    let inQuote = false;
    let cur = "";
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') {
        inQuote = !inQuote;
      } else if (c === "," && !inQuote) {
        cols.push(cur);
        cur = "";
      } else {
        cur += c;
      }
    }
    cols.push(cur);
    rows.push(cols);
  }
  return rows;
}

export default function ReservationImport() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [castMap, setCastMap] = useState<Map<string, string>>(new Map());
  const [parsed, setParsed] = useState<ParsedRow[]>([]);
  const [importing, setImporting] = useState(false);
  const [importedCount, setImportedCount] = useState(0);
  const [fileName, setFileName] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!authLoading && !user) navigate("/login");
  }, [user, authLoading, navigate]);

  useEffect(() => {
    if (user) loadCasts();
  }, [user]);

  const loadCasts = async () => {
    const { data } = await supabase.from("casts").select("id, name");
    const map = new Map<string, string>();
    (data || []).forEach((c: any) => map.set(c.name, c.id));
    setCastMap(map);
  };

  const handleFile = (file: File) => {
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      // Remove BOM
      const cleaned = text.replace(/^﻿/, "");
      const rows = parseCSV(cleaned);
      if (rows.length < 2) return;

      const headers = rows[0];
      const getCol = (row: string[], name: string) =>
        row[headers.indexOf(name)] || "";

      const result: ParsedRow[] = [];
      for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        if (row.every((c) => !c.trim())) continue;

        const dateStr = getCol(row, "予約日");
        const parsed_date = parseDate(dateStr);
        if (!parsed_date) continue;

        const castRaw = getCol(row, "キャスト");
        const castName = parseCastName(castRaw);

        result.push({
          reservation_date: parsed_date.date,
          start_time: parsed_date.time,
          customer_name: getCol(row, "予約名"),
          cast_name: castName,
          cast_id: castName ? (castMap.get(castName) || null) : null,
          course: getCol(row, "コース"),
          duration: parseDuration(getCol(row, "コース")),
          room: getCol(row, "ルーム"),
          price: parsePrice(getCol(row, "売上")),
          therapist_back: parsePrice(getCol(row, "報酬")),
          payment_method: parsePayment(getCol(row, "決済")),
          status: parseStatus(getCol(row, "ステータス")),
          route: getCol(row, "経路"),
        });
      }
      setParsed(result);
    };
    reader.readAsText(file, "utf-8");
  };

  const unmatchedCasts = [...new Set(
    parsed.filter((r) => r.cast_name && !r.cast_id).map((r) => r.cast_name)
  )];

  const validRows = parsed.filter((r) => r.reservation_date);

  const handleImport = async () => {
    setImporting(true);
    setImportedCount(0);
    try {
      const BATCH = 100;
      let count = 0;
      for (let i = 0; i < validRows.length; i += BATCH) {
        const batch = validRows.slice(i, i + BATCH).map((r) => ({
          reservation_date: r.reservation_date,
          start_time: r.start_time,
          customer_name: r.customer_name,
          cast_id: r.cast_id,
          course_name: r.course,
          duration: r.duration,
          room: r.room || null,
          price: r.price,
          therapist_back: r.therapist_back || null,
          payment_method: r.payment_method,
          status: r.status,
          route: r.route || null,
        }));
        const { error } = await supabase.from("reservations").insert(batch);
        if (error) {
          console.error("Batch error:", error);
          toast.error(`エラー: ${error.message}`);
          break;
        }
        count += batch.length;
        setImportedCount(count);
      }
      toast.success(`${count}件をインポートしました`);
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <DashboardHeader onToggleSidebar={() => setSidebarOpen(!sidebarOpen)} />
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <main className="pt-[60px] md:ml-[240px] p-6">
        <div className="max-w-3xl mx-auto">
          <h1 className="text-2xl font-bold mb-2">予約データインポート</h1>
          <p className="text-muted-foreground text-sm mb-6">
            キャスカンのCSVエクスポートから予約データを一括インポートします
          </p>

          {/* Upload area */}
          <Card className="mb-6">
            <CardContent className="pt-6">
              <div
                className="border-2 border-dashed border-border rounded-lg p-10 text-center cursor-pointer hover:bg-muted/30 transition-colors"
                onClick={() => fileRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const file = e.dataTransfer.files[0];
                  if (file) handleFile(file);
                }}
              >
                <Upload size={32} className="mx-auto mb-3 text-muted-foreground" />
                {fileName ? (
                  <div className="flex items-center justify-center gap-2">
                    <FileText size={16} className="text-primary" />
                    <span className="font-medium text-primary">{fileName}</span>
                  </div>
                ) : (
                  <>
                    <p className="font-medium">CSVファイルをドロップ、またはクリックして選択</p>
                    <p className="text-sm text-muted-foreground mt-1">reservations_all.csv</p>
                  </>
                )}
                <input
                  ref={fileRef}
                  type="file"
                  accept=".csv"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleFile(file);
                  }}
                />
              </div>
            </CardContent>
          </Card>

          {parsed.length > 0 && (
            <>
              {/* Summary */}
              <div className="grid grid-cols-3 gap-4 mb-6">
                <Card>
                  <CardContent className="pt-4 text-center">
                    <p className="text-3xl font-bold">{validRows.length}</p>
                    <p className="text-sm text-muted-foreground mt-1">取込対象件数</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4 text-center">
                    <p className="text-3xl font-bold text-green-600">
                      {validRows.filter((r) => r.cast_id).length}
                    </p>
                    <p className="text-sm text-muted-foreground mt-1">キャスト紐付け済</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4 text-center">
                    <p className="text-3xl font-bold text-orange-500">
                      {validRows.filter((r) => r.cast_name && !r.cast_id).length}
                    </p>
                    <p className="text-sm text-muted-foreground mt-1">キャスト未紐付け</p>
                  </CardContent>
                </Card>
              </div>

              {/* Unmatched casts warning */}
              {unmatchedCasts.length > 0 && (
                <Card className="mb-6 border-orange-200 bg-orange-50">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <AlertCircle size={16} className="text-orange-600" />
                      DBに存在しないキャスト名（cast_id=nullでインポートされます）
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-wrap gap-2">
                      {unmatchedCasts.map((n) => (
                        <span key={n} className="bg-orange-100 text-orange-800 text-xs px-2 py-1 rounded">
                          {n}
                        </span>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Preview table */}
              <Card className="mb-6">
                <CardHeader>
                  <CardTitle className="text-sm">プレビュー（先頭10件）</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs border-collapse">
                      <thead>
                        <tr className="border-b border-border">
                          <th className="px-2 py-1 text-left">予約日</th>
                          <th className="px-2 py-1 text-left">時間</th>
                          <th className="px-2 py-1 text-left">顧客名</th>
                          <th className="px-2 py-1 text-left">キャスト</th>
                          <th className="px-2 py-1 text-left">コース</th>
                          <th className="px-2 py-1 text-right">売上</th>
                          <th className="px-2 py-1 text-left">ステータス</th>
                        </tr>
                      </thead>
                      <tbody>
                        {validRows.slice(0, 10).map((r, i) => (
                          <tr key={i} className="border-b border-border last:border-0">
                            <td className="px-2 py-1">{r.reservation_date}</td>
                            <td className="px-2 py-1">{r.start_time}</td>
                            <td className="px-2 py-1">{r.customer_name}</td>
                            <td className="px-2 py-1">
                              <span className={r.cast_id ? "text-green-700" : "text-orange-600"}>
                                {r.cast_name || "—"}
                              </span>
                            </td>
                            <td className="px-2 py-1">{r.course}</td>
                            <td className="px-2 py-1 text-right">¥{r.price.toLocaleString()}</td>
                            <td className="px-2 py-1">{r.status}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>

              {/* Import button */}
              {importedCount > 0 ? (
                <Card className="border-green-200 bg-green-50">
                  <CardContent className="pt-4 flex items-center gap-3">
                    <CheckCircle className="text-green-600" size={20} />
                    <p className="text-green-800 font-medium">{importedCount}件のインポートが完了しました</p>
                  </CardContent>
                </Card>
              ) : (
                <Button
                  size="lg"
                  className="w-full"
                  onClick={handleImport}
                  disabled={importing || validRows.length === 0}
                >
                  {importing ? (
                    <><Loader2 size={16} className="mr-2 animate-spin" />インポート中... ({importedCount}/{validRows.length})</>
                  ) : (
                    `${validRows.length}件をインポートする`
                  )}
                </Button>
              )}
            </>
          )}
        </div>
      </main>
    </div>
  );
}
