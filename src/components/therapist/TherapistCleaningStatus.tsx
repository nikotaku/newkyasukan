import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

export function TherapistCleaningStatus({ token, businessDate, revision }: { token: string; businessDate: string; revision: number }) {
  const [state, setState] = useState<{ sales: boolean; saved: boolean; notified: boolean } | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true;
    setState(null);
    setFailed(false);
    const body = new FormData();
    body.append("token", token);
    body.append("action", "status");
    void Promise.all([
      supabase.rpc("get_therapist_daily_sales_submission", { p_token: token, p_date: businessDate }),
      supabase.functions.invoke("submit-cleaning-report", { body }),
    ]).then(([sales, cleaning]) => {
      if (!active) return;
      if (sales.error || cleaning.error || !cleaning.data?.success) { setFailed(true); return; }
      setState({ sales: Boolean(sales.data?.length), saved: Boolean(cleaning.data.report), notified: cleaning.data.report?.notification_status === "sent" });
    }).catch(() => { if (active) setFailed(true); });
    return () => { active = false; };
  }, [token, businessDate, revision]);
  return (
    <section className={`rounded-xl border p-4 ${state?.sales && !state.saved ? "border-amber-300 bg-amber-50" : "bg-card"}`}>
      <h2 className="font-bold">精算と清掃報告</h2>
      <p className="mt-1 text-sm leading-6">精算は先に送信できます。清掃報告は、掃除が終わってから退室までに送ってください。</p>
      <p className="my-3 text-sm font-semibold" role="status">
        {failed ? "状態を取得できませんでした。清掃報告画面で確認してください。" : !state ? "報告状況を確認中…" : `${state.sales ? "精算送信済み" : "精算未送信"} ／ ${state.saved ? "清掃報告済み" : "清掃未報告"}`}
      </p>
      {state?.saved && !state.notified && <p className="mb-3 text-xs text-amber-800">清掃報告は保存済みです。LINE通知は未完了です。</p>}
      <Button asChild variant="outline" className="w-full"><Link to={`/therapist/${token}/cleaning-report`}>{state?.saved ? "清掃報告を確認" : "清掃が終わったら報告する"}</Link></Button>
    </section>
  );
}
