// ヘッダーのベル：セラピストから届いて、まだ承認していない精算（src/lib/pendingSettlements.ts）
import { useQuery } from "@tanstack/react-query";
import { format, subDays } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { castAdminLabel } from "@/lib/castProfileCompletion";
import { PENDING_SETTLEMENT_DAYS, pendingSettlements, type PendingSettlement } from "@/lib/pendingSettlements";

export interface PendingSettlementItem extends PendingSettlement {
  castName: string;
  totalAmount: number | null;
}

export function usePendingSettlements(storeId: string | undefined) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["pending-settlements", storeId, user?.id],
    enabled: Boolean(storeId && user),
    queryFn: async (): Promise<PendingSettlementItem[]> => {
      const since = format(subDays(new Date(), PENDING_SETTLEMENT_DAYS), "yyyy-MM-dd");
      const [submissions, approvals] = await Promise.all([
        supabase
          .from("daily_sales_records")
          .select("cast_id, date, created_at, status, total_amount")
          .eq("store_id", storeId as string)
          .gte("date", since)
          .order("created_at", { ascending: false })
          .limit(500),
        supabase
          .from("settlement_approvals" as never)
          .select("cast_id, date")
          .eq("store_id", storeId as string)
          .gte("date", since)
          .limit(1000),
      ]);
      if (submissions.error) throw submissions.error;
      if (approvals.error) throw approvals.error;
      const rows = (submissions.data ?? []) as { cast_id: string | null; date: string; created_at: string; status: string | null; total_amount: number | null }[];
      const pending = pendingSettlements(rows, (approvals.data ?? []) as unknown as { cast_id: string; date: string }[]);
      if (!pending.length) return [];
      const ids = [...new Set(pending.map((p) => p.castId))];
      const { data: casts } = await supabase.from("casts").select("id, name, real_name").in("id", ids);
      const names = new Map((casts ?? []).map((c) => [c.id, castAdminLabel(c)]));
      return pending.map((p) => ({
        ...p,
        castName: names.get(p.castId) || "セラピスト",
        totalAmount: rows.find((r) => r.cast_id === p.castId && r.date === p.date && r.created_at === p.submittedAt)?.total_amount ?? null,
      }));
    },
    staleTime: 10_000,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });
}
