import { Navigate, useLocation } from "react-router-dom";

// 以前のスケジュールのURL（WEB予約受付・予約一覧・空き枠・エスたま自動化履歴）を、
// スケジュールダッシュボードの該当タブへ転送する。元のURLのクエリ（?source= など）は引き継ぐ。
export function ScheduleTabRedirect({ tab, source }: { tab: string; source?: string }) {
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  params.set("tab", tab);
  if (source && !params.get("source")) params.set("source", source);
  return <Navigate to={`/schedule-dashboard?${params.toString()}`} replace />;
}
