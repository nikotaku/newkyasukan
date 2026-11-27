import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAdminStore } from "@/hooks/useAdminStore";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

const deliveryLabels: Record<string, string> = { sent: "配信済み", queued: "配信待ち", running: "処理中", review: "要確認", failed: "配信失敗", expired: "期限終了", skipped: "見送り", unconnected: "未配信" };
const formatTime = (value: string) => new Date(value).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" });

export default function RealtimeNoticeManagement() {
  const { storeId } = useAdminStore();
  const [body, setBody] = useState("");
  const [hours, setHours] = useState(1);
  const [busy, setBusy] = useState(false);
  const [page, setPage] = useState(0);
  const requestId = useRef("");
  const { data, error, refetch } = useQuery({
    queryKey: ["realtime-notice-history", storeId, page],
    enabled: Boolean(storeId),
    refetchInterval: 60000,
    queryFn: async () => {
      const result = await supabase.from("realtime_notices").select("*").eq("store_id", storeId!)
        .order("created_at", { ascending: false }).order("id").range(page*25,page*25+25);
      if (result.error) throw result.error;
      return result.data;
    },
  });
  useEffect(() => { requestId.current = ""; setPage(0); }, [storeId]);
  async function submit(id?: string) {
    if (!storeId || busy) return;
    setBusy(true);
    try {
      requestId.current ||= crypto.randomUUID();
      const result = id
        ? await supabase.rpc("stop_realtime_notice", {p_store:storeId,p_id:id})
        : await supabase.rpc("publish_realtime_notice", {p_store:storeId,p_body:body.trim(),p_minutes:hours*60,p_id:requestId.current});
      if (result.error) throw result.error;
      if (!id) { setBody(""); setPage(0); requestId.current = ""; }
      await refetch();
      toast.success(id ? "HPの掲載を終了しました" : "HPに掲載しました");
    } catch { toast.error("保存できませんでした。配信履歴をご確認ください。"); }
    finally { setBusy(false); }
  }
  return <div className="space-y-5">
    <section className="space-y-3 rounded-lg border p-4">
      <h2 className="font-bold">リアルタイム集客</h2>
      <label className="block">現在のご案内（120文字以内）
        <Textarea value={body} disabled={busy} maxLength={120} placeholder="今すぐご案内可能です。" onChange={e => {setBody(e.target.value); requestId.current = "";}} />
      </label>
      <label className="block">掲載時間
        <select className="ml-2 rounded border bg-background p-2" value={hours} disabled={busy} onChange={e => {setHours(Number(e.target.value)); requestId.current = "";}}>
          {[0.5,1,2,3,6,12,24].map(h => <option key={h} value={h}>{h === 0.5 ? "30分" : h+"時間"}</option>)}
        </select>
      </label>
      <p className="text-sm text-muted-foreground">新しい案内を掲載すると、前の案内は終了します。同じ短文をエステ魂の配信待ちに登録します。</p>
      <Button disabled={!storeId || busy || !body.trim()} onClick={() => submit()}>HP・エステ魂に配信する</Button>
    </section>
    <section className="space-y-2"><h2 className="font-bold">配信履歴</h2>
      {error && <p role="alert">履歴を読み込めませんでした。</p>}
      {data?.length === 0 && <p>配信履歴はありません。</p>}
      {data?.slice(0,25).map(row => {
        const active = !row.ended_at && Date.parse(row.expires_at)>Date.now();
        return <article key={row.id} className="space-y-1 rounded-lg border p-3">
          <p className="whitespace-pre-wrap break-words">{row.body}</p>
          <p className="text-sm">HP {active ? "掲載中" : "掲載終了"} ／ エステ魂 {deliveryLabels[row.estama_status] || "要確認"}</p>
          <p className="text-xs">{formatTime(row.created_at)} 〜 {formatTime(row.ended_at || row.expires_at)}</p>
          {active && <Button variant="outline" disabled={busy} onClick={() => submit(row.id)}>掲載を終了</Button>}
        </article>;
      })}
      {page>0 && <Button variant="outline" onClick={() => setPage(page-1)}>前へ</Button>}
      {(data?.length ?? 0)>25 && <Button variant="outline" onClick={() => setPage(page+1)}>次へ</Button>}
    </section>
  </div>;
}
