// 宣伝ノルマ（今月の露出）の材料を読み、セラピストごとの一覧にする。
// 投稿宣伝スケジュールの「露出ノルマ」と、媒体登録状況の「今月の露出」列で使う。
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  buildQuotaBoard,
  DEFAULT_QUOTA_CONFIG,
  monthRange,
  normalizeQuotaConfig,
  type QuotaArticleInput,
  type QuotaCastInput,
  type QuotaConfig,
  type QuotaExposureInput,
  type QuotaPlanInput,
  type QuotaPlanTaskInput,
  type QuotaRow,
  type QuotaShiftInput,
  type QuotaXPostInput,
} from "@/lib/promotionQuota";
import { businessDate } from "@/lib/xDailyPosts";

export const currentBusinessDate = () => businessDate(new Date());

const tokyoMidnightIso = (date: string) => new Date(`${date}T00:00:00+09:00`).toISOString();

export function usePromotionQuota(storeId: string | null, month: string) {
  const [rows, setRows] = useState<QuotaRow[]>([]);
  const [config, setConfig] = useState<QuotaConfig>(DEFAULT_QUOTA_CONFIG);
  const [configSaved, setConfigSaved] = useState(false);
  const [plans, setPlans] = useState<QuotaPlanInput[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!storeId) return;
    setLoading(true);
    setError("");
    const { start, end } = monthRange(month);
    const [settingsRes, castsRes, shiftsRes, exposuresRes, plansRes, tasksRes, articlesRes, xRes] = await Promise.all([
      supabase.from("promotion_quota_settings" as never).select("config").eq("store_id", storeId).maybeSingle(),
      supabase
        .from("casts")
        .select("id,name,join_date")
        .eq("store_id", storeId)
        .eq("is_active", true)
        .order("display_order", { ascending: true }),
      supabase
        .from("shifts")
        .select("cast_id,shift_date,status,approval_status")
        .eq("store_id", storeId)
        .gte("shift_date", start)
        .lt("shift_date", end),
      supabase
        .from("promotion_exposures" as never)
        .select("id,cast_id,channel_key,exposed_on,note,url,plan_id")
        .eq("store_id", storeId)
        .gte("exposed_on", start)
        .lt("exposed_on", end),
      supabase
        .from("promotion_plans")
        .select("id,title,therapist_label,cast_ids")
        .eq("store_id", storeId)
        .eq("is_active", true),
      supabase
        .from("promotion_plan_tasks")
        .select("id,plan_id,task_type,channel_key,scheduled_on,is_completed,label")
        .eq("store_id", storeId)
        .eq("task_type", "posting")
        .gte("scheduled_on", start)
        .lt("scheduled_on", end),
      supabase
        .from("hp_articles")
        .select("id,title,content,created_at,is_published")
        .eq("store_id", storeId)
        .eq("is_published", true)
        .gte("created_at", tokyoMidnightIso(start))
        .lt("created_at", tokyoMidnightIso(end)),
      supabase
        .from("x_daily_posts" as never)
        .select("post_date,account_key,slot_key,text,posted_text,posted_at,publish_status,post_url")
        .eq("store_id", storeId)
        .eq("account_key", "shukyaku")
        .gte("post_date", start)
        .lt("post_date", end),
    ]);

    // ノルマの決まり・記録が読めないときは止める。企画（店長のみ）・HP・Xは読めなくても記録だけで数える
    const fatal = castsRes.error || shiftsRes.error || exposuresRes.error || settingsRes.error;
    if (fatal) {
      setError(fatal.message);
      setLoading(false);
      return;
    }
    const savedConfig = (settingsRes.data as { config?: unknown } | null)?.config;
    const nextConfig = savedConfig ? normalizeQuotaConfig(savedConfig) : DEFAULT_QUOTA_CONFIG;
    const nextPlans = (plansRes.data ?? []) as QuotaPlanInput[];
    setConfig(nextConfig);
    setConfigSaved(Boolean(savedConfig));
    setPlans(nextPlans);
    setRows(buildQuotaBoard({
      month,
      today: currentBusinessDate(),
      config: nextConfig,
      casts: (castsRes.data ?? []) as QuotaCastInput[],
      shifts: (shiftsRes.data ?? []) as QuotaShiftInput[],
      exposures: (exposuresRes.data ?? []) as unknown as QuotaExposureInput[],
      plans: nextPlans,
      planTasks: (tasksRes.data ?? []) as QuotaPlanTaskInput[],
      articles: (articlesRes.data ?? []) as QuotaArticleInput[],
      xPosts: (xRes.data ?? []) as unknown as QuotaXPostInput[],
    }));
    setLoading(false);
  }, [month, storeId]);

  useEffect(() => {
    void load();
  }, [load]);

  return { rows, config, configSaved, plans, loading, error, reload: load };
}
