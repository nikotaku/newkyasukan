import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';

type Job={id:string;job_type:string;status:string;runner:string;submission_started_at:string|null;error_message:string|null;result?:{url?:string}};
type Data={settings:{diary_enabled:boolean;monthly_limit_minutes:number;last_dispatch_error:string|null;last_audit_at:string|null;last_audit_result:{ok:boolean;verifiedAccounts:number;failedAccounts:number}|null};summary:{minutes:number;runs:number;monthlyJobs:number;diarySuccessRate:number|null;shiftSuccessRate:number|null;queued:number;running:number;failed:number;reviewRequired:number;lastRun:string|null;lastSuccess:string|null;averageJobSeconds:number|null};jobs:Job[]};
const labels:Record<string,string>={queued:'待機中',running:'実行中',completed:'完了',failed:'失敗',review_required:'要確認',cancelled:'取消済み'};
const date=(value:string|null)=>value?new Date(value).toLocaleString('ja-JP',{timeZone:'Asia/Tokyo'}):'記録なし';
const percent=(value:number|null)=>value===null?'対象なし':`${value}%`;
export function AutomationRunnerStatus({storeId}:{storeId:string}) {
 const [data,setData]=useState<Data|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const request=useCallback(async(body?:Record<string,unknown>)=>{
  const {data:{session}}=await supabase.auth.getSession();
  if(!session) throw new Error('ログインが必要です');
  const r=await fetch('/api/automations/estama-direct-runner',{method:body?'POST':'GET',headers:{Authorization:`Bearer ${session.access_token}`,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
  const result=await r.json(); if(!r.ok) throw new Error(result.error||'稼働状況を取得できません');return result;
 },[]);
 const load=useCallback(async()=>{setBusy(true);try{setData(await request());setError('');}catch(e){setError(e instanceof Error?e.message:'取得に失敗しました');}finally{setBusy(false);}},[request]);
 useEffect(()=>{void load();const timer=window.setInterval(()=>void load(),30000);return()=>window.clearInterval(timer);},[load,storeId]);
 const manage=async(jobId:string,action:string)=>{setBusy(true);try{await request({jobId,action});await load();}catch(e){setError(e instanceof Error?e.message:'操作に失敗しました');}finally{setBusy(false);}};
 return <section className="space-y-3 rounded-lg border p-3" aria-label="自動化の稼働状況">
  <div className="flex items-center justify-between"><h3 className="font-semibold">自動化の稼働状況</h3><Button size="sm" variant="ghost" disabled={busy} onClick={()=>void load()}>更新</Button></div>
  {error&&<p role="alert" className="text-xs text-destructive">{error}</p>}
  {!data?<p className="text-xs text-muted-foreground">稼働状況を読み込み中</p>:<>
   <div className="flex flex-wrap items-center gap-2"><Badge variant={data.settings.diary_enabled?'default':'secondary'}>写メ日記：{data.settings.diary_enabled?'無料実行環境':'移行検証中'}</Badge><span className="text-xs text-muted-foreground">シフト・その他：従来環境</span></div>
   <div className="grid grid-cols-2 gap-2 text-xs">
    {[['今月の実行時間（新環境）',`${data.summary.minutes} 分 / 目安 ${data.settings.monthly_limit_minutes} 分`],['新環境の起動回数',`${data.summary.runs} 回`],['今月の処理件数（全環境）',`${data.summary.monthlyJobs} 件`],['投稿成功率',percent(data.summary.diarySuccessRate)],['シフト成功率',percent(data.summary.shiftSuccessRate)],['待機中 / 実行中',`${data.summary.queued} / ${data.summary.running} 件`],['失敗 / 要確認',`${data.summary.failed} / ${data.summary.reviewRequired} 件`],['平均処理時間（記録済み）',data.summary.averageJobSeconds===null?'記録なし':`${data.summary.averageJobSeconds} 秒`]].map(([label,value])=><div className="rounded bg-muted/50 p-2" key={label}><p className="text-muted-foreground">{label}</p><p className="mt-1 font-medium">{value}</p></div>)}
   </div>
   <p className="text-xs text-muted-foreground">新環境の時間は準備を含む実測の概算です。公開リポジトリの標準実行環境を使用します。失敗件数は過去の履歴を含みます。</p>
   {data.summary.minutes>=data.settings.monthly_limit_minutes*.8&&<p role="alert" className="text-xs text-amber-700">月間目安の80%を超えました。上限に達すると新規実行を止め、待機ジョブを保持します。</p>}
   {data.settings.last_dispatch_error&&<p role="alert" className="text-xs text-destructive">{data.settings.last_dispatch_error}</p>}
   <div className="text-xs text-muted-foreground"><p>最終実行：{date(data.summary.lastRun)}</p><p>最終成功：{date(data.summary.lastSuccess)}</p><p>ログイン検証：{date(data.settings.last_audit_at)} {data.settings.last_audit_result?(data.settings.last_audit_result.ok?`確認済み ${data.settings.last_audit_result.verifiedAccounts} 人`:'未完了・結果の確認が必要'):''}</p></div>
   <details><summary className="cursor-pointer text-xs font-medium">待機・失敗・要確認の処理（最大100件）</summary><div className="mt-2 max-h-52 space-y-2 overflow-y-auto">
    {data.jobs.map(job=><div key={job.id} className="rounded border p-2 text-xs"><div className="flex justify-between gap-2"><span>{job.job_type==='estama_post_diary'?'写メ日記':job.job_type==='estama_sync_shift'?'シフト同期':'プロフィール登録'}</span><Badge variant="outline">{labels[job.status]||job.status}</Badge></div>{job.error_message&&<p className="mt-1 break-words text-destructive">{job.error_message}</p>}
    {job.runner==='github_actions'&&<div className="mt-2 flex gap-2">
     {job.status==='failed'&&!job.submission_started_at&&<Button size="sm" variant="outline" disabled={busy} onClick={()=>void manage(job.id,'retry')}>再実行</Button>}
     {['queued','failed'].includes(job.status)&&!job.submission_started_at&&<Button size="sm" variant="outline" disabled={busy} onClick={()=>void manage(job.id,'cancel')}>取消</Button>}
     {(job.status==='review_required'||job.submission_started_at)&&<a href="https://estama.jp/tamathera/diary/" target="_blank" rel="noreferrer" className="underline">掲載先を確認</a>}
    </div>}</div>)}
   </div></details>
  </>}
 </section>;
}
