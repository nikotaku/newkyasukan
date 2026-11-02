import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import type {
  TherapistPromotionPlan,
  TherapistPromotionReport,
} from "@/lib/therapistPromotion";

async function promotionRpc<T>(
  name: string,
  args: Record<string, unknown>,
): Promise<T> {
  const { data, error } = await supabase.rpc(name as never, args as never);
  if (error) throw new Error(error.message);
  return data as T;
}

export function useTherapistPromotion(token: string) {
  return useQuery({
    queryKey: ["therapist-promotion", token],
    enabled: Boolean(token),
    queryFn: async () =>
      (await promotionRpc<TherapistPromotionPlan[]>(
        "get_therapist_promotion_schedule",
        { p_token: token },
      )) ?? [],
    staleTime: 15_000,
    refetchInterval: 30_000,
  });
}

export function completeTherapistPromotionTask(
  token: string,
  taskId: string,
  completed: boolean,
) {
  return promotionRpc<boolean>("complete_therapist_promotion_task", {
    p_token: token,
    p_task_id: taskId,
    p_completed: completed,
  });
}

export function useTherapistPromotionReports(
  storeId: string | undefined,
  unreadOnly: boolean,
) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["promotion-reports", storeId, user?.id, unreadOnly],
    enabled: Boolean(storeId && user),
    queryFn: async () =>
      (await promotionRpc<TherapistPromotionReport[]>(
        "get_therapist_promotion_reports",
        {
          p_store_id: storeId,
          p_unread_only: unreadOnly,
        },
      )) ?? [],
    staleTime: 10_000,
    refetchInterval: 30_000,
  });
}

export function useAcknowledgePromotionReport(storeId: string | undefined) {
  const queryClient = useQueryClient();
  return async (reportId: string) => {
    const marked = await promotionRpc<boolean>(
      "mark_therapist_promotion_report_seen",
      { p_report_id: reportId },
    );
    if (!marked)
      throw new Error(
        "報告を確認済みにできませんでした。再読み込みしてください",
      );
    await queryClient.invalidateQueries({
      queryKey: ["promotion-reports", storeId],
    });
  };
}
