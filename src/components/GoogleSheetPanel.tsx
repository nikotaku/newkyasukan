import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { fetchSheetRows, getStoredUrl, saveUrl, GSheetSource } from "@/lib/googleSheet";
import { RefreshCw, Settings, Table, AlertCircle, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";

interface GoogleSheetPanelProps {
  source: GSheetSource;
  onData?: (headers: string[], rows: string[][]) => void;
  className?: string;
}

export function GoogleSheetPanel({ source, onData, className }: GoogleSheetPanelProps) {
  const [url, setUrl] = useState(getStoredUrl(source));
  const [draft, setDraft] = useState(getStoredUrl(source));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<string[][]>([]);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const handleSaveUrl = () => {
    saveUrl(source, draft.trim());
    setUrl(draft.trim());
    setSettingsOpen(false);
  };

  const handleFetch = async (fetchUrl = url) => {
    if (!fetchUrl) { setSettingsOpen(true); return; }
    setLoading(true);
    setError("");
    setRows([]);
    setHeaders([]);
    try {
      const result = await fetchSheetRows(fetchUrl);
      setHeaders(result.headers);
      setRows(result.rows);
      onData?.(result.headers, result.rows);
    } catch (e: any) {
      setError(e.message || "取得に失敗しました");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={cn("space-y-3", className)}>
      {/* Controls */}
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={() => handleFetch()}
          disabled={loading}
          className="gap-1.5"
        >
          <RefreshCw size={13} className={cn(loading && "animate-spin")} />
          {url ? "シートから取得" : "シートURL未設定"}
        </Button>

        <Sheet open={settingsOpen} onOpenChange={setSettingsOpen}>
          <SheetTrigger asChild>
            <Button size="sm" variant="ghost" className="gap-1.5 text-muted-foreground">
              <Settings size={13} />
              設定
            </Button>
          </SheetTrigger>
          <SheetContent>
            <SheetHeader>
              <SheetTitle>Googleスプレッドシート連携</SheetTitle>
            </SheetHeader>
            <div className="mt-6 space-y-4">
              <div className="text-sm text-muted-foreground space-y-1">
                <p>スプレッドシートを <strong>「リンクを知っている全員が閲覧可能」</strong> に設定してからURLを貼り付けてください。</p>
                <a
                  href="https://support.google.com/docs/answer/183965"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-blue-500 hover:underline text-xs"
                >
                  共有設定の方法 <ExternalLink size={11} />
                </a>
              </div>
              <div>
                <label className="text-sm font-medium block mb-1">スプレッドシートURL</label>
                <Input
                  placeholder="https://docs.google.com/spreadsheets/d/..."
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  特定のシート（タブ）を指定する場合は、そのシートを開いた状態のURLを貼り付けてください
                </p>
              </div>
              <div className="flex gap-2 pt-2">
                <Button className="flex-1" onClick={handleSaveUrl}>保存して取得</Button>
                <Button variant="outline" onClick={() => setSettingsOpen(false)}>閉じる</Button>
              </div>
            </div>
          </SheetContent>
        </Sheet>

        {rows.length > 0 && (
          <span className="text-xs text-muted-foreground">{rows.length}行 × {headers.length}列</span>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-start gap-2 text-sm text-red-600 bg-red-50 rounded-md p-3">
          <AlertCircle size={15} className="mt-0.5 shrink-0" />
          <div>
            <p className="font-medium">取得エラー</p>
            <p className="text-xs mt-0.5">{error}</p>
            <p className="text-xs mt-1 text-red-500">
              シートが「リンクを知っている全員が閲覧可能」になっているか確認してください
            </p>
          </div>
        </div>
      )}

      {/* Table */}
      {rows.length > 0 && (
        <Card>
          <CardHeader className="py-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Table size={14} />
              スプレッドシートのデータ（{rows.length}件）
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-auto max-h-[480px]">
              <table className="w-full text-xs border-collapse">
                <thead className="sticky top-0 bg-muted/80">
                  <tr>
                    {headers.map((h, i) => (
                      <th
                        key={i}
                        className="border border-border px-2 py-1.5 text-left font-semibold whitespace-nowrap"
                      >
                        {h || `列${i + 1}`}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, ri) => (
                    <tr key={ri} className="hover:bg-muted/20">
                      {headers.map((_, ci) => (
                        <td
                          key={ci}
                          className="border border-border px-2 py-1 whitespace-nowrap max-w-[200px] truncate"
                        >
                          {row[ci] ?? ""}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
