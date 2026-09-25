import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { format } from "date-fns";
import { MessageSquare, ChevronRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { SMS_LOG_COLUMNS, outboundStatus, toE164, type SmsLog } from "@/lib/smsLogs";

interface SmsHistoryProps {
  phone?: string | null;
  customerId?: string | null;
  reservationId?: string | null;
  storeId?: string | null;
}

/** 予約詳細・顧客詳細に出す、そのお客様とのSMSやり取り履歴 */
export function SmsHistory({ phone, customerId, reservationId, storeId }: SmsHistoryProps) {
  const [logs, setLogs] = useState<SmsLog[]>([]);
  const [loading, setLoading] = useState(true);
  const number = toE164(phone);

  useEffect(() => {
    const conds: string[] = [];
    if (reservationId) conds.push(`reservation_id.eq.${reservationId}`);
    if (customerId) conds.push(`customer_id.eq.${customerId}`);
    if (number) conds.push(`to_number.eq."${number}"`, `from_number.eq."${number}"`);
    if (conds.length === 0) {
      setLogs([]);
      setLoading(false);
      return;
    }
    let q = supabase
      .from("sms_logs" as any)
      .select(SMS_LOG_COLUMNS)
      .or(conds.join(","))
      .order("created_at", { ascending: true })
      .limit(200);
    if (storeId) q = q.eq("store_id", storeId);
    q.then(({ data }) => {
      setLogs(((data as unknown) as SmsLog[]) ?? []);
      setLoading(false);
    });
  }, [phone, customerId, reservationId, storeId, number]);

  return (
    <div className="rounded-lg border">
      <div className="flex items-center justify-between px-3 py-2 border-b bg-muted/30">
        <span className="flex items-center gap-1.5 text-sm font-semibold">
          <MessageSquare size={14} className="text-primary" />SMS履歴
          <span className="text-xs font-normal text-muted-foreground">（{logs.length}件）</span>
        </span>
        {number && (
          <Link to={`/sms?to=${encodeURIComponent(number)}`} className="inline-flex items-center text-xs text-primary font-medium">
            SMS画面で開く<ChevronRight size={13} />
          </Link>
        )}
      </div>
      {loading ? (
        <p className="text-xs text-muted-foreground text-center py-4">読み込み中...</p>
      ) : logs.length === 0 ? (
        <p className="text-xs text-muted-foreground text-center py-4">SMSのやり取りはまだありません</p>
      ) : (
        <div className="max-h-72 overflow-y-auto p-3 space-y-2 bg-muted/10">
          {logs.map((log) => {
            const out = log.direction !== "inbound";
            const st = out ? outboundStatus(log) : null;
            return (
              <div key={log.id} className={cn("flex flex-col", out ? "items-end" : "items-start")}>
                <div
                  className={cn(
                    "max-w-[85%] rounded-2xl px-3 py-2 text-xs whitespace-pre-wrap break-words",
                    out ? "bg-primary text-primary-foreground rounded-br-sm" : "bg-card border rounded-bl-sm",
                  )}
                >
                  {log.body}
                </div>
                <div className="flex items-center gap-1.5 mt-0.5 text-[10px] text-muted-foreground">
                  {st && <span className={cn("px-1.5 py-0.5 rounded-full font-medium", st.className)}>{st.label}</span>}
                  {format(new Date(log.created_at), "M/d HH:mm")}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
