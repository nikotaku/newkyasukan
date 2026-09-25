import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAdminStore } from "@/hooks/useAdminStore";
import { formatJpPhone, type SmsLog } from "@/lib/smsLogs";

/**
 * 現在の店舗の未読SMS（受信・未読）件数。
 * sms_logs の変更を Realtime で購読し、返信が届いたらトーストで知らせる。
 */
export const useSmsUnread = () => {
  const { store, loading } = useAdminStore();
  const storeId = store?.id;
  const [unread, setUnread] = useState(0);

  const refresh = useCallback(async () => {
    if (!storeId) return;
    const { count } = await supabase
      .from("sms_logs" as any)
      .select("id", { count: "exact", head: true })
      .eq("store_id", storeId)
      .eq("direction", "inbound")
      .eq("is_read", false);
    setUnread(count ?? 0);
  }, [storeId]);

  useEffect(() => {
    if (loading || !storeId) return;
    refresh();
    const channel = supabase
      .channel(`sms-unread-${storeId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "sms_logs", filter: `store_id=eq.${storeId}` },
        async (payload) => {
          refresh();
          if (payload.eventType !== "INSERT") return;
          const log = payload.new as SmsLog;
          if (log.direction !== "inbound") return;
          let name = log.from_number ? formatJpPhone(log.from_number) : "お客";
          if (log.customer_id) {
            const { data } = await supabase.from("customers").select("name").eq("id", log.customer_id).maybeSingle();
            if (data?.name) name = data.name;
          }
          toast(`${name}様からSMS返信`, {
            description: log.body.length > 60 ? `${log.body.slice(0, 60)}…` : log.body,
            action: { label: "開く", onClick: () => { window.location.href = `/sms?to=${encodeURIComponent(log.from_number ?? "")}`; } },
          });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [storeId, loading, refresh]);

  return unread;
};
