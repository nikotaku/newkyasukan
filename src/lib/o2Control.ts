import { supabase } from "@/integrations/supabase/client";
export type O2Request = {
  id: string;
  cast_id: string | null;
  username: string;
  display_name: string;
  profile_url: string;
  status: string;
  error: string | null;
  first_seen_at: string;
};
export type O2Job = {
  id: string;
  cast_id: string;
  kind: string;
  status: string;
  error: string | null;
  updated_at: string;
};
export type O2Settings = {
  enabled: boolean;
  checked_at: string | null;
  last_status: string;
  last_error: string | null;
  email_checked_at: string | null;
};
export const O2_JOB_LABELS: Record<string, string> = {
  queued: "処理待ち",
  running: "処理中",
  awaiting_email: "認証メール待ち",
  awaiting_review: "02運営の審査待ち",
  completed: "確認完了",
  failed: "処理できませんでした",
  review_required: "確認が必要です",
};
export async function callO2Control(
  storeId: string,
  action: string,
  extra: Record<string, unknown> = {},
) {
  const { data, error } = await supabase.functions.invoke("o2-control", {
    body: { ...extra, storeId, action },
  });
  if (error) {
    let detail: string | undefined;
    try {
      detail = (await error.context?.json())?.error;
    } catch {
      /* fall back to safe message */
    }
    throw new Error(detail || "02連携に接続できませんでした");
  }
  if (data?.error) throw new Error(data.error);
  return data;
}
