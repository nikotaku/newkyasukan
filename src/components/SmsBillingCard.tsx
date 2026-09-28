import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Loader2, RefreshCw, Wallet } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

// Edge Function sms-billing の summary（supabase/functions/sms-billing/billing.ts の BillingSummary）
interface BillingSummary {
  currency: string;
  balance: number;
  pendingSegments: number;
  pendingEstimate: number;
  effectiveBalance: number;
  monthUsage: number;
  monthOutboundMessages: number;
  monthOutboundSegments: number;
  unitPrice: number;
  threshold: number;
  low: boolean;
}

const TWILIO_BILLING_URL = "https://console.twilio.com/us1/billing/manage-billing/billing-overview";
const yen = (value: number) => `${Math.round(value).toLocaleString("ja-JP")}円`;

/**
 * Twilio（SMS）の残高と今月の使用額。送信済みで料金が未確定の分を引いた「実質残高」を大きく出す。
 * compact はSMS画面の一覧の上に置く1行表示。
 */
export function SmsBillingCard({ compact = false }: { compact?: boolean }) {
  const [summary, setSummary] = useState<BillingSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: invokeError } = await supabase.functions.invoke("sms-billing", { body: { action: "summary" } });
    if (invokeError || !data || typeof data.balance !== "number") {
      setError("残高を取得できませんでした");
      setSummary(null);
    } else {
      setSummary(data as BillingSummary);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  if (compact) {
    if (loading || error || !summary) return null;
    return (
      <a
        href={TWILIO_BILLING_URL}
        target="_blank"
        rel="noreferrer"
        className={cn(
          "flex items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-xs",
          summary.low ? "bg-rose-50 text-rose-700" : "bg-muted/60 text-muted-foreground",
        )}
      >
        <span className="flex items-center gap-1.5">
          {summary.low ? <AlertTriangle size={13} /> : <Wallet size={13} />}
          SMS残高 約{yen(summary.effectiveBalance)}
        </span>
        <span>{summary.low ? "チャージしてください" : `今月 約${yen(summary.monthUsage)}`}</span>
      </a>
    );
  }

  return (
    <Card className={cn("mb-6", summary?.low && "border-rose-300")}>
      <CardContent className="pt-4 space-y-3">
        <div className="flex items-center justify-between">
          <p className="font-semibold flex items-center gap-2">
            <Wallet size={16} className="text-primary" />SMSの残高（Twilio）
          </p>
          <Button size="sm" variant="ghost" onClick={load} disabled={loading} aria-label="再読み込み">
            {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
          </Button>
        </div>
        {error ? (
          <p className="text-sm text-muted-foreground">{error}</p>
        ) : !summary ? (
          <p className="text-sm text-muted-foreground">読み込み中...</p>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div>
                <p className="text-xs text-muted-foreground">実質の残り</p>
                <p className={cn("text-xl font-bold", summary.low && "text-rose-600")}>約{yen(summary.effectiveBalance)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">今月の使用額</p>
                <p className="text-xl font-bold">約{yen(summary.monthUsage)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">今月の送信</p>
                <p className="text-sm font-medium">{summary.monthOutboundMessages}通（{summary.monthOutboundSegments}通分）</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Twilioの残高表示</p>
                <p className="text-sm font-medium">{yen(summary.balance)}</p>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              送信済みで料金が未確定の {summary.pendingSegments}通分（約{yen(summary.pendingEstimate)}）を引いた額です。
              日本語のSMSは70文字（長文は67文字）ごとに1通分・約{Math.round(summary.unitPrice)}円かかります。
            </p>
            {summary.low && (
              <div className="rounded-md bg-rose-50 text-rose-700 text-sm p-3 flex gap-2">
                <AlertTriangle size={16} className="shrink-0 mt-0.5" />
                <div>
                  残高が{yen(summary.threshold)}を切っています。0円になるとSMSが送れなくなるので、
                  <a href={TWILIO_BILLING_URL} target="_blank" rel="noreferrer" className="underline font-medium">Twilioの請求画面</a>
                  でチャージするか、オートチャージを設定してください。
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
