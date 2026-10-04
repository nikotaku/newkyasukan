import { useCallback, useEffect, useState } from "react";
import { format } from "date-fns";
import { ja } from "date-fns/locale";
import { AlertTriangle, CheckCircle2, Clock, ExternalLink, Image, Loader2, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";

// エスたま自動化履歴の「プロフィール同期」。作業ごとに、終わった画面のスクリーンショット
// （Vercel のワーカーが非公開バケット estama-job-screenshots に保存）を一緒に出す。

const SCREENSHOT_BUCKET = "estama-job-screenshots";

type Job = {
  id: string;
  job_type: string;
  status: string;
  cast_id: string | null;
  error_message: string | null;
  created_at: string;
  finished_at: string | null;
  screenshot_path: string | null;
  payload: { source?: string } | null;
};

const jobTitle = (job: Job) => {
  const source = job.payload?.source;
  if (source === "cast_insert" || source === "auto_register_enabled" || source === "manual_run") return "セラピスト登録・同期";
  return "プロフィール同期";
};

const statusView = (status: string) => {
  if (status === "completed") return { label: "完了", className: "border-emerald-200 bg-emerald-50 text-emerald-700", icon: CheckCircle2 };
  if (status === "failed" || status === "cancelled") return { label: "失敗", className: "border-rose-200 bg-rose-50 text-rose-700", icon: XCircle };
  if (status === "waiting_for_login") return { label: "ログイン待ち", className: "border-amber-200 bg-amber-50 text-amber-700", icon: AlertTriangle };
  if (status === "running") return { label: "反映中", className: "border-sky-200 bg-sky-50 text-sky-700", icon: Loader2 };
  return { label: "待機中", className: "border-slate-200 bg-slate-50 text-slate-600", icon: Clock };
};

export function EstamaProfileSyncHistory({ storeId, reloadKey }: { storeId: string; reloadKey: number }) {
  const [jobs, setJobs] = useState<Job[] | null>(null);
  const [names, setNames] = useState<Record<string, string>>({});
  const [images, setImages] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("automation_jobs")
      .select("id,job_type,status,cast_id,error_message,created_at,finished_at,screenshot_path,payload")
      .eq("store_id", storeId)
      .eq("provider", "estama")
      .eq("job_type", "estama_register_cast")
      .order("created_at", { ascending: false })
      .limit(30);
    const rows = (data || []) as unknown as Job[];
    setJobs(rows);

    const castIds = [...new Set(rows.map((job) => job.cast_id).filter((id): id is string => Boolean(id)))];
    if (castIds.length) {
      const { data: casts } = await supabase.from("casts").select("id,name").in("id", castIds);
      setNames(Object.fromEntries((casts || []).map((cast) => [cast.id, cast.name])));
    }

    const paths = rows.map((job) => job.screenshot_path).filter((path): path is string => Boolean(path));
    if (paths.length) {
      const { data: signed } = await supabase.storage.from(SCREENSHOT_BUCKET).createSignedUrls(paths, 60 * 60);
      setImages(Object.fromEntries((signed || [])
        .filter((item) => item.path && item.signedUrl)
        .map((item) => [item.path as string, item.signedUrl])));
    } else {
      setImages({});
    }
  }, [storeId]);

  useEffect(() => {
    void load();
  }, [load, reloadKey]);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">プロフィール同期の履歴</CardTitle>
        <p className="text-xs text-muted-foreground">
          作業が終わったときのエステ魂の画面を保存しています（30日分）。画像をタップすると大きく見られます。
        </p>
      </CardHeader>
      <CardContent>
        {jobs === null ? (
          <div className="py-6 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : jobs.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">まだ履歴はありません。</p>
        ) : (
          <div className="divide-y rounded-lg border">
            {jobs.map((job) => {
              const view = statusView(job.status);
              const StatusIcon = view.icon;
              const image = job.screenshot_path ? images[job.screenshot_path] : null;
              return (
                <div key={job.id} className="flex flex-wrap items-start gap-3 px-3 py-3 text-sm">
                  {image ? (
                    <a href={image} target="_blank" rel="noreferrer" className="group shrink-0 overflow-hidden rounded-md border">
                      <img src={image} alt="作業が終わった画面" loading="lazy" className="h-20 w-28 object-cover object-top transition group-hover:opacity-90" />
                    </a>
                  ) : (
                    <div className="flex h-20 w-28 shrink-0 items-center justify-center rounded-md border border-dashed text-[10px] text-muted-foreground">
                      <Image className="mr-1 h-3.5 w-3.5" />画面なし
                    </div>
                  )}
                  <div className="min-w-[160px] flex-1">
                    <p className="font-medium">{jobTitle(job)}</p>
                    <p className="text-muted-foreground">{job.cast_id ? names[job.cast_id] || "セラピスト" : "店舗全体"}</p>
                    <p className="text-xs text-muted-foreground">
                      {format(new Date(job.finished_at || job.created_at), "yyyy/M/d HH:mm", { locale: ja })}
                    </p>
                    {job.error_message && job.status !== "completed" && (
                      <p className="mt-1 text-xs text-rose-600">{job.error_message}</p>
                    )}
                    {image && (
                      <a href={image} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 text-xs text-primary">
                        画面を開く<ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                  </div>
                  <Badge variant="outline" className={`ml-auto ${view.className}`}>
                    <StatusIcon className={`mr-1 h-3.5 w-3.5 ${job.status === "running" ? "animate-spin" : ""}`} />{view.label}
                  </Badge>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
