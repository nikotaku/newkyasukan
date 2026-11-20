import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { useAdminStore } from "@/hooks/useAdminStore";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import RealtimeNoticeManagement from "./RealtimeNoticeManagement";
import { PrNewsTypes } from "@/components/pr/PrNewsTypes";

const db: SupabaseClient = supabase;
// ニュースの自動投稿（4種類・画像付き）は PrNewsTypes で切り替える。ここはそれ以外の配信
const labels = {realtime:"リアルタイム集客",attendance:"出勤情報アピール",guest_appeal:"集客ワンクリックアピール",job_appeal:"求人ワンクリックアピール",recruiting:"リアルタイム求人",invites:"招待メッセージ"} as const;
const historyLabels: Record<string,string> = {...labels,news:"ニュース（今すぐご案内）",news_attendance:"ニュース（本日の出勤）",news_intro:"ニュース（セラピスト紹介）",news_coupon:"ニュース（クーポン紹介）"};
const statuses: Record<string,string> = {queued:"配信待ち",running:"処理中",sent:"配信確認済み",skipped:"見送り",failed:"失敗",review:"要確認",expired:"期限終了"};
export default function PrDesk() {
  const {storeId} = useAdminStore();
  const [page,setPage] = useState(0);
  const settings=useQuery({queryKey:["pr-settings",storeId],enabled:!!storeId,queryFn:async()=>{
    const r=await db.from("pr_desk_settings").select("*").eq("store_id",storeId).maybeSingle();
    if(r.error) throw r.error;
    return r.data;
  }});
  const preview=useQuery({queryKey:["pr-preview",storeId],enabled:!!storeId,refetchInterval:30000,queryFn:async()=>{
    const r=await db.rpc("pr_desk_preview",{p_store:storeId}); if(r.error) throw r.error; return r.data;
  }});
  const history=useQuery({queryKey:["pr-history",storeId,page],enabled:!!storeId,refetchInterval:15000,queryFn:async()=>{
    const r=await db.from("pr_desk_history").select("id,kind,body,created_at,status,detail").eq("store_id",storeId).order("created_at",{ascending:false}).order("id").range(25*page,25*page+25);
    if(r.error) throw r.error; return r.data;
  }});
  const coupons=useQuery({queryKey:["pr-coupons",storeId],enabled:!!storeId,queryFn:async()=>{
    const r=await db.from("discounts").select("id,name").eq("store_id",storeId).eq("is_active",true).eq("public_booking_enabled",true);if(r.error) throw r.error;return r.data;
  }});
  return <div className="space-y-5"><h2 className="text-xl font-bold">AI広報部</h2>
    <section className="rounded-lg border p-4"><h3 className="font-bold">本日の配信予定</h3>
    <p>次のご案内　{preview.data?.next || "案内枠なし"}</p><p>出勤情報の更新時刻　{preview.data?.slots?.join(" ／ ") || "予定なし"}</p></section>
    {storeId && <PrNewsTypes storeId={storeId} />}
    {settings.data && <form key={storeId} className="grid gap-3 rounded-lg border p-4" onSubmit={async e=>{
      e.preventDefault(); const form=new FormData(e.currentTarget);
      const flags=Object.fromEntries(Object.keys(labels).map(k=>[k,form.has(k)]));
      const job_text=String(form.get("job_text")||"").trim(),invite_text=String(form.get("invite_text")||"").trim(),coupon_id=form.get("coupon_id")||null;
      if((flags.recruiting && !job_text)||(flags.invites && (!invite_text || !coupon_id))) {toast.error("求人文または招待文とクーポンを設定してください");return;}
      const r=await db.from("pr_desk_settings").update({...flags,job_text,invite_text,coupon_id}).eq("store_id",storeId).select("store_id").single();
      if(r.error) toast.error("設定を保存できませんでした");else {await settings.refetch();toast.success("自動配信設定を保存しました");}
    }}>
    <h3 className="font-bold">自動配信設定</h3>{Object.entries(labels).map(([k,v])=><label key={k}><input className="mr-2" type="checkbox" name={k} defaultChecked={settings.data[k]} />{v}</label>)}
    <label>求人の短文<textarea className="block w-full rounded border p-2" name="job_text" defaultValue={settings.data.job_text} maxLength={120}/></label>
    <label>招待メッセージ<textarea className="block w-full rounded border p-2" name="invite_text" defaultValue={settings.data.invite_text} maxLength={500}/></label>
    <label>配信用クーポン<select className="ml-2 border" name="coupon_id" defaultValue={settings.data.coupon_id||""}><option value="">選択してください</option>{coupons.data?.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
    <Button type="submit">設定を保存</Button></form>}
    {(settings.error||history.error||preview.error) && <p role="alert">配信データを読み込めませんでした。</p>}
    <RealtimeNoticeManagement/>
    <section><h3 className="font-bold">エステ魂の配信履歴</h3>{history.data?.length===0 && <p>履歴はありません。</p>}
    {history.data?.slice(0,25).map(r=><article key={r.id} className="border-b py-2"><strong>{historyLabels[r.kind] ?? r.kind}　{statuses[r.status]}</strong><p className="break-words">{r.body}</p><small>{new Date(r.created_at).toLocaleString("ja-JP",{timeZone:"Asia/Tokyo"})}　{r.detail?.message}</small></article>)}
    {page>0 && <Button onClick={()=>setPage(page-1)}>前へ</Button>}{(history.data?.length||0)>25 && <Button onClick={()=>setPage(page+1)}>次へ</Button>}</section>
    </div>;
}
