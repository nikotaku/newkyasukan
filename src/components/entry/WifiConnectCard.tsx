import { useEffect, useState } from "react";
import { Copy, Expand, Wifi } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { wifiQrPayload, type WifiSecurity } from "@/lib/roomEntry";

// ルームの Wi-Fi。スマホのカメラで QR コードを読み取ると、そのままつながる。
// お客様にもそのまま見せられるよう、大きく表示するボタンも付ける。

type QrMatrix = { size: number; path: string };

async function buildQr(text: string): Promise<QrMatrix> {
  const { default: qrcode } = await import("qrcode-generator");
  // 日本語の Wi-Fi 名も読めるように UTF-8 で入れる
  qrcode.stringToBytes = (value: string) => Array.from(new TextEncoder().encode(value));
  const qr = qrcode(0, "M");
  qr.addData(text, "Byte");
  qr.make();
  const count = qr.getModuleCount();
  let path = "";
  for (let row = 0; row < count; row += 1) {
    for (let col = 0; col < count; col += 1) {
      if (qr.isDark(row, col)) path += `M${col + 4},${row + 4}h1v1h-1z`;
    }
  }
  return { size: count + 8, path };
}

function QrImage({ matrix, scanning, className }: { matrix: QrMatrix; scanning?: boolean; className?: string }) {
  return (
    <div className={`relative overflow-hidden rounded-lg bg-white ${className ?? ""}`}>
      <svg viewBox={`0 0 ${matrix.size} ${matrix.size}`} className="block h-full w-full" shapeRendering="crispEdges" role="img" aria-label="Wi-Fi の QR コード">
        <path d={matrix.path} fill="#111827" />
      </svg>
      {scanning && (
        <span
          className="pointer-events-none absolute inset-x-[6%] h-[3px] rounded-full bg-sky-500/80 shadow-[0_0_12px_3px_rgba(14,165,233,.55)]"
          style={{ animation: "entry-wifi-scan 2.4s ease-in-out infinite" }}
        />
      )}
    </div>
  );
}

export function WifiConnectCard({ ssid, password, security }: { ssid: string; password: string | null; security: WifiSecurity }) {
  const [matrix, setMatrix] = useState<QrMatrix | null>(null);
  const [showLarge, setShowLarge] = useState(false);
  const payload = wifiQrPayload({ ssid, password, security });

  useEffect(() => {
    let cancelled = false;
    buildQr(payload)
      .then((result) => {
        if (!cancelled) setMatrix(result);
      })
      .catch(() => null);
    return () => {
      cancelled = true;
    };
  }, [payload]);

  const copy = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(`${label}をコピーしました`);
    } catch {
      toast.error("コピーできませんでした");
    }
  };

  return (
    <div className="rounded-lg border border-sky-200 bg-sky-50/70 p-3 dark:border-sky-900/60 dark:bg-sky-950/20">
      <style>{`@keyframes entry-wifi-scan { 0% { top: 8%; } 50% { top: 88%; } 100% { top: 8%; } }`}</style>
      <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-sky-800 dark:text-sky-300">
        <Wifi size={14} />Wi-Fi
      </p>
      <div className="flex gap-3">
        <button
          type="button"
          onClick={() => setShowLarge(true)}
          className="relative h-[116px] w-[116px] shrink-0 rounded-lg ring-1 ring-sky-200 dark:ring-sky-800"
          aria-label="QRコードを大きく表示"
        >
          {matrix ? <QrImage matrix={matrix} scanning className="h-full w-full" /> : <div className="h-full w-full animate-pulse rounded-lg bg-white/70" />}
        </button>
        <div className="min-w-0 flex-1 space-y-2">
          <div>
            <p className="text-[11px] text-muted-foreground">ネットワーク名</p>
            <div className="flex items-center gap-1">
              <p className="min-w-0 flex-1 break-all text-sm font-semibold">{ssid}</p>
              <button type="button" onClick={() => void copy(ssid, "ネットワーク名")} className="shrink-0 p-1 text-primary" aria-label="ネットワーク名をコピー">
                <Copy size={14} />
              </button>
            </div>
          </div>
          {password && security !== "nopass" && (
            <div>
              <p className="text-[11px] text-muted-foreground">パスワード</p>
              <div className="flex items-center gap-1">
                <p className="min-w-0 flex-1 break-all font-mono text-sm font-semibold">{password}</p>
                <button type="button" onClick={() => void copy(password, "パスワード")} className="shrink-0 p-1 text-primary" aria-label="パスワードをコピー">
                  <Copy size={14} />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
      <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
        ほかのスマホのカメラでQRコードを読み取ると、そのままつながります。このスマホでつなぐときは、パスワードをコピーして「設定」→「Wi-Fi」から選んでください。
      </p>
      <Button type="button" variant="outline" size="sm" className="mt-2 w-full gap-1.5" onClick={() => setShowLarge(true)}>
        <Expand size={14} />QRコードを大きく表示（お客様に見せる）
      </Button>

      <Dialog open={showLarge} onOpenChange={setShowLarge}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Wifi size={18} />Wi-Fi</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-center">
            {/* 読み取りやすいよう、大きい表示では動く線を出さない */}
            {matrix && <QrImage matrix={matrix} className="mx-auto aspect-square w-full max-w-[300px] p-2" />}
            <p className="text-sm font-semibold">カメラで読み取ると Wi-Fi につながります</p>
            <div className="rounded-lg bg-muted/50 p-2 text-left text-sm">
              <p><span className="text-muted-foreground">ネットワーク名：</span><b className="break-all">{ssid}</b></p>
              {password && security !== "nopass" && (
                <p><span className="text-muted-foreground">パスワード：</span><b className="break-all font-mono">{password}</b></p>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
