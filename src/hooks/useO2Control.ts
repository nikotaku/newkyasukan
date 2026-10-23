import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAdminStore } from "@/hooks/useAdminStore";
import { useAuth } from "@/hooks/useAuth";
import type { O2Job, O2Request, O2Settings } from "@/lib/o2Control";
export function useO2Control() {
  const { storeId, loading } = useAdminStore();
  const { user } = useAuth();
  const query = useQuery({
    queryKey: ["o2-control", user?.id, storeId],
    enabled: !!user && !loading,
    refetchInterval: 30000,
    queryFn: async () => {
      const [settings, requests, jobs] = await Promise.all([
        supabase
          .from("o2_control_settings" as never)
          .select("enabled,checked_at,last_status,last_error,email_checked_at")
          .eq("store_id", storeId)
          .maybeSingle(),
        supabase
          .from("o2_link_requests" as never)
          .select(
            "id,cast_id,username,display_name,profile_url,status,error,first_seen_at",
          )
          .eq("store_id", storeId)
          .in("status", ["pending", "approving", "review_required"])
          .order("first_seen_at"),
        supabase
          .from("o2_account_jobs" as never)
          .select("id,cast_id,kind,status,error,updated_at")
          .eq("store_id", storeId)
          .order("created_at", { ascending: false })
          .limit(200),
      ]);
      if (settings.error || requests.error || jobs.error)
        throw new Error("02連携状況を取得できません");
      return {
        settings: settings.data as unknown as O2Settings | null,
        requests: (requests.data || []) as unknown as O2Request[],
        jobs: (jobs.data || []) as unknown as O2Job[],
      };
    },
  });
  return { ...query, storeId };
}
