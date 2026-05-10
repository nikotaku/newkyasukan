import { useState, useRef, useEffect } from "react";
import { DashboardHeader } from "@/components/DashboardHeader";
import { Sidebar } from "@/components/Sidebar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Upload, Loader2, CheckCircle, FileText } from "lucide-react";

interface ParsedCustomer {
  name: string;
  kana: string;
  phone: string;
  email: string | null;
  visit_count: number | null;
  status: string;
  ng: string | null;
  notes: string | null;
  created_at: string | null;
}

function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const cols: string[] = [];
    let inQuote = false;
    let cur = "";
    for (const c of line) {
      if (c === '"') { inQuote = !inQuote; }
      else if (c === "," && !inQuote) { cols.push(cur); cur = ""; }
      else { cur += c; }
    }
    cols.push(cur);
    rows.push(cols);
  }
  return rows;
}

function parseStatus(s: string): string {
  switch (s) {
    case "出禁": return "banned";
    case "要注意": return "caution";
    default: return "active";
  }
}

export default function CustomerImport() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [parsed, setParsed] = useState<ParsedCustomer[]>([]);
  const [fileName, setFileName] = useState("");
  const [importing, setImporting] = useState(false);
  const [importedCount, setImportedCount] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);

  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!authLoading && !user) navigate("/login");
  }, [user, authLoading, navigate]);

  const handleFile = (file: File) => {
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = (e.target?.result as string).replace(/^﻿/, "");
      const rows = parseCSV(text);
      if (rows.length < 2) return;

      const headers = rows[0];
      const get = (row: string[], name: string) => (row[headers.indexOf(name)] || "").trim();

      const result: ParsedCustomer[] = [];
      for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        if (row.every((c) => !c.trim())) continue;

        const phone = get(row, "電話番号").replace(/^'/, "").replace(/[^\d]/g, "");
        if (!phone) continue;

        const visitRaw = get(row, "利用回数");
        const ngRaw = get(row, "NG");
        const notesRaw = get(row, "メモ");
        const createdRaw = get(row, "登録日");

        result.push({
          name: get(row, "名前") || phone,
          kana: get(row, "かな"),
          phone,
          email: get(row, "Email") || null,
          visit_count: visitRaw ? parseInt(visitRaw, 10) : null,
          status: parseStatus(get(row, "ステータス")),
          ng: ngRaw || null,
          notes: [notesRaw, ngRaw ? `NG: ${ngRaw}` : ""].filter(Boolean).join(" / ") || null,
          created_at: createdRaw ? new Date(createdRaw).toISOString() : null,
        });
      }
      setParsed(result);
    };
    reader.readAsText(file, "utf-8");
  };

  const handleImport = async () => {
    setImporting(true);
    setImportedCount(0);
    let count = 0;
    try {
      const BATCH = 100;
      for (let i = 0; i < parsed.length; i += BATCH) {
        const batch = parsed.slice(i, i + BATCH).map((r) => ({
          name: r.name,
          phone: r.phone,
          email: r.email,
          visit_count: r.visit_count,
          status: r.status,
          notes: r.notes,
        }));
        const { error } = await supabase.from("customers").insert(batch);
        if (error) {
          console.error("Batch error:", error);
          toast.error(`エラー: ${error.message}`);
          break;
        }
        count += batch.length;
        setImportedCount(count);
      }
      if (count === parsed.length) toast.success(`${count}件をインポートしました`);
    } finally {
      setImporting(false);
    }
  };

  const statusCounts = parsed.reduce((acc, r) => {
    acc[r.status] = (acc[r.status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return (
    <div className="min-h-screen bg-background">
      <DashboardHeader onToggleSidebar={() => setSidebarOpen(!sidebarOpen)} />
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <main className="pt-[60px] md:ml-[240px] p-6">
        <div className="max-w-3xl mx-auto">
          <h1 className="text-2xl font-bold mb-2">顧客データインポート</h1>
          <p className="text-muted-foreground text-sm mb-6">
            キャスカンの顧客CSVから一括インポートします
          </p>

          {/* Upload */}
          <Card className="mb-6">
            <CardContent className="pt-6">
              <div
                className="border-2 border-dashed border-border rounded-lg p-10 text-center cursor-pointer hover:bg-muted/30 transition-colors"
                onClick={() => fileRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
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
                    <p className="text-sm text-muted-foreground mt-1">customers_all.csv</p>
                  </>
                )}
                <input ref={fileRef} type="file" accept=".csv" className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
              </div>
            </CardContent>
          </Card>

          {parsed.length > 0 && (
            <>
              {/* Stats */}
              <div className="grid grid-cols-4 gap-3 mb-6">
                <Card>
                  <CardContent className="pt-4 text-center">
                    <p className="text-2xl font-bold">{parsed.length}</p>
                    <p className="text-xs text-muted-foreground mt-1">総件数</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4 text-center">
                    <p className="text-2xl font-bold text-green-600">{statusCounts.active || 0}</p>
                    <p className="text-xs text-muted-foreground mt-1">良好</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4 text-center">
                    <p className="text-2xl font-bold text-orange-500">{statusCounts.caution || 0}</p>
                    <p className="text-xs text-muted-foreground mt-1">要注意</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4 text-center">
                    <p className="text-2xl font-bold text-red-600">{statusCounts.banned || 0}</p>
                    <p className="text-xs text-muted-foreground mt-1">出禁</p>
                  </CardContent>
                </Card>
              </div>

              {/* Preview */}
              <Card className="mb-6">
                <CardHeader>
                  <CardTitle className="text-sm">プレビュー（先頭10件）</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs border-collapse">
                      <thead>
                        <tr className="border-b border-border">
                          <th className="px-2 py-1 text-left">名前</th>
                          <th className="px-2 py-1 text-left">電話番号</th>
                          <th className="px-2 py-1 text-left">メール</th>
                          <th className="px-2 py-1 text-right">利用回数</th>
                          <th className="px-2 py-1 text-left">ステータス</th>
                          <th className="px-2 py-1 text-left">メモ</th>
                        </tr>
                      </thead>
                      <tbody>
                        {parsed.slice(0, 10).map((r, i) => (
                          <tr key={i} className="border-b border-border last:border-0">
                            <td className="px-2 py-1 font-medium">{r.name}</td>
                            <td className="px-2 py-1">{r.phone}</td>
                            <td className="px-2 py-1">{r.email || "—"}</td>
                            <td className="px-2 py-1 text-right">{r.visit_count ?? "—"}</td>
                            <td className="px-2 py-1">
                              <span className={
                                r.status === "banned" ? "text-red-600 font-medium" :
                                r.status === "caution" ? "text-orange-600 font-medium" :
                                "text-green-700"
                              }>
                                {r.status === "banned" ? "出禁" : r.status === "caution" ? "要注意" : "良好"}
                              </span>
                            </td>
                            <td className="px-2 py-1 text-muted-foreground">{r.notes || "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>

              {importedCount > 0 && importedCount === parsed.length ? (
                <Card className="border-green-200 bg-green-50">
                  <CardContent className="pt-4 flex items-center gap-3">
                    <CheckCircle className="text-green-600" size={20} />
                    <p className="text-green-800 font-medium">{importedCount}件のインポートが完了しました</p>
                  </CardContent>
                </Card>
              ) : (
                <Button size="lg" className="w-full" onClick={handleImport} disabled={importing}>
                  {importing
                    ? <><Loader2 size={16} className="mr-2 animate-spin" />インポート中... ({importedCount}/{parsed.length})</>
                    : `${parsed.length}件をインポートする`}
                </Button>
              )}
            </>
          )}
        </div>
      </main>
    </div>
  );
}
