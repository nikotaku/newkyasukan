import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Check, Loader2, Minus, RefreshCw, Search } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useAdminStore } from "@/hooks/useAdminStore";
import { driveImgUrl } from "@/lib/drive";
import { cn } from "@/lib/utils";
import {
  autoStatusFrom,
  estamaStage,
  MEDIA_CHECKLIST_FIELDS,
  MEDIA_COLUMNS,
  MEDIA_NAMES,
  mediaProgress,
  type MediaAutoStatus,
  type MediaChecklist,
  type MediaChecklistField,
  type PortalDevice,
} from "@/lib/mediaRegistration";

type CastRow = MediaChecklist & { id: string; name: string; photo: string | null };

type SnsOverviewRow = {
  cast_id: string;
  credential_configured: boolean;
  x_login_id: string | null;
  x_credential_configured: boolean;
  estama_credential_configured: boolean;
};

const rpc = (name: string, args: Record<string, unknown>) =>
  (supabase.rpc as unknown as (rpcName: string, params: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>)(name, args);

/**
 * セラピストごとの媒体登録状況（エステ魂にどこまで登録したか・O2やXを作ったか）を1つの表で見て、その場で切り替える。
 * ログイン情報・連携結果の列は自動（読み取り専用）。ログイン情報の登録は「SNS連携・ログイン情報」タブで行う。
 */
export function MediaRegistrationMatrix({ onOpenSns }: { onOpenSns?: () => void }) {
  const { storeId, loading: storeLoading } = useAdminStore();
  const [casts, setCasts] = useState<CastRow[]>([]);
  const [auto, setAuto] = useState<Record<string, MediaAutoStatus>>({});
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<"progressAsc" | "name">("progressAsc");

  const load = useCallback(async () => {
    if (storeLoading || !storeId) return;
    setLoading(true);
    const [castsRes, profilesRes, snsRes, devicesRes] = await Promise.all([
      supabase
        .from("casts")
        .select(`id,name,photo,${MEDIA_CHECKLIST_FIELDS.join(",")}`)
        .eq("store_id", storeId)
        .eq("is_active", true)
        .order("name"),
      supabase
        .from("external_cast_profiles" as never)
        .select("cast_id,sync_status,soul_status,last_error")
        .eq("store_id", storeId)
        .eq("provider", "estama"),
      rpc("get_sns_connection_overview_v9", { p_store_id: storeId }),
      // マイページの通知の登録（ホーム画面から通知をオンにしたか・テスト通知を受け取ったか）
      supabase
        .from("therapist_push_subscriptions" as never)
        .select("cast_id,standalone,test_confirmed_at")
        .eq("store_id", storeId),
    ]);
    if (castsRes.error) toast.error(`セラピストを読み込めませんでした: ${castsRes.error.message}`);
    const profiles = new Map(((profilesRes.data || []) as Array<{ cast_id: string; sync_status: string | null; soul_status: string | null; last_error: string | null }>)
      .map((row) => [row.cast_id, row]));
    const sns = new Map(((snsRes.data || []) as SnsOverviewRow[]).map((row) => [row.cast_id, row]));
    const devices = new Map<string, PortalDevice[]>();
    for (const device of (devicesRes.data || []) as Array<PortalDevice & { cast_id: string }>) {
      devices.set(device.cast_id, [...(devices.get(device.cast_id) || []), device]);
    }
    const rows = (castsRes.data || []) as unknown as CastRow[];
    setCasts(rows);
    setAuto(Object.fromEntries(rows.map((cast) => [
      cast.id,
      autoStatusFrom({
        estamaProfile: profiles.get(cast.id) || null,
        sns: sns.get(cast.id) || null,
        portalDevices: devices.get(cast.id) || [],
      }),
    ])));
    setLoading(false);
  }, [storeId, storeLoading]);

  useEffect(() => { void load(); }, [load]);

  const toggle = async (castId: string, field: MediaChecklistField, next: boolean) => {
    setCasts((prev) => prev.map((cast) => (cast.id === castId ? { ...cast, [field]: next } : cast)));
    const { error } = await supabase.from("casts").update({ [field]: next } as never).eq("id", castId);
    if (error) {
      toast.error("更新できませんでした");
      void load();
    }
  };

  const visible = useMemo(() => {
    const filtered = casts.filter((cast) => cast.name.toLowerCase().includes(query.trim().toLowerCase()));
    return sort === "name"
      ? filtered
      : [...filtered].sort((a, b) => mediaProgress(a).done - mediaProgress(b).done || a.name.localeCompare(b.name, "ja"));
  }, [casts, query, sort]);

  const totals = useMemo(() => MEDIA_COLUMNS.map((column) => casts.filter((cast) => (
    column.field ? cast[column.field] : column.auto ? auto[cast.id]?.[column.auto] : false
  )).length), [casts, auto]);

  const groupSpans = MEDIA_NAMES.map((media) => ({ media, span: MEDIA_COLUMNS.filter((c) => c.media === media).length }));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[180px]">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="名前で検索" className="h-9 pl-8" />
        </div>
        <div className="flex gap-1.5">
          {([{ key: "progressAsc", label: "進捗が低い順" }, { key: "name", label: "名前順" }] as const).map((option) => (
            <button
              key={option.key}
              onClick={() => setSort(option.key)}
              className={cn(
                "rounded-full border px-3 py-1 text-xs",
                sort === option.key ? "border-primary bg-primary/10 text-primary font-semibold" : "text-muted-foreground",
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
        <Button size="sm" variant="outline" onClick={load} disabled={loading}>
          <RefreshCw size={14} className={cn("mr-1", loading && "animate-spin")} />更新
        </Button>
        {onOpenSns && (
          <Button size="sm" variant="outline" onClick={onOpenSns}>ログイン情報を登録する</Button>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        ○をタップすると登録済み／未登録を切り替えます。「自動連携」「魂セラピスト」「ログイン情報」は連携の結果から自動で表示されます（ログイン情報の登録は「SNS連携・ログイン情報」タブ）。
        「マイページ」は、セラピストがマイページをホーム画面に追加して通知をオンにすると「ホーム画面・通知」、テスト通知を受け取る（タップする・「届いた」を押す）と「テスト通知」に✓が付きます。
      </p>

      <div className="overflow-x-auto rounded-xl border bg-card">
        <table className="w-full min-w-[920px] text-xs">
          <thead className="bg-muted/60 text-muted-foreground">
            <tr>
              <th rowSpan={2} className="sticky left-0 z-10 bg-muted px-3 py-2 text-left">セラピスト</th>
              {groupSpans.map(({ media, span }) => (
                <th key={media} colSpan={span} className="border-l px-2 py-1.5 text-center font-semibold text-foreground">{media}</th>
              ))}
            </tr>
            <tr>
              {MEDIA_COLUMNS.map((column, index) => (
                <th
                  key={`${column.media}-${column.label}`}
                  className={cn(
                    "px-1.5 py-1.5 text-center font-medium whitespace-nowrap",
                    (index === 0 || MEDIA_COLUMNS[index - 1].media !== column.media) && "border-l",
                    column.auto && "text-muted-foreground/80",
                  )}
                >
                  {column.label}
                  <div className="text-[10px] font-normal text-muted-foreground">{totals[index]}/{casts.length}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={MEDIA_COLUMNS.length + 1} className="py-12 text-center"><Loader2 className="inline-block animate-spin text-primary" /></td></tr>
            ) : visible.length === 0 ? (
              <tr><td colSpan={MEDIA_COLUMNS.length + 1} className="py-10 text-center text-muted-foreground">セラピストがいません</td></tr>
            ) : visible.map((cast) => {
              const progress = mediaProgress(cast);
              const status = auto[cast.id];
              return (
                <tr key={cast.id} className="border-t">
                  <td className="sticky left-0 z-10 bg-card px-3 py-2">
                    <div className="flex items-center gap-2 min-w-[150px]">
                      {cast.photo
                        ? <img src={driveImgUrl(cast.photo)} alt="" className="h-8 w-8 rounded-full object-cover shrink-0" />
                        : <div className="h-8 w-8 rounded-full bg-muted shrink-0" />}
                      <div className="min-w-0">
                        <p className="font-semibold truncate text-sm">{cast.name}</p>
                        <div className="flex items-center gap-1.5">
                          <div className="h-1.5 w-14 rounded-full bg-muted overflow-hidden">
                            <div className="h-full bg-primary" style={{ width: `${progress.ratio * 100}%` }} />
                          </div>
                          <span className="text-[10px] text-muted-foreground">{progress.done}/{progress.total}</span>
                        </div>
                        <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                          魂: {estamaStage(cast, status || {})}
                          {status?.estama_error && (
                            <span title={status.estama_error}><AlertTriangle size={11} className="text-rose-500" /></span>
                          )}
                        </p>
                      </div>
                    </div>
                  </td>
                  {MEDIA_COLUMNS.map((column, index) => {
                    const on = column.field ? cast[column.field] : Boolean(column.auto && status?.[column.auto]);
                    const groupStart = index === 0 || MEDIA_COLUMNS[index - 1].media !== column.media;
                    return (
                      <td key={`${column.media}-${column.label}`} className={cn("px-1.5 py-2 text-center", groupStart && "border-l")}>
                        {column.field ? (
                          <button
                            type="button"
                            onClick={() => toggle(cast.id, column.field!, !on)}
                            aria-label={`${cast.name} ${column.media} ${column.label}: ${on ? "登録済み" : "未登録"}`}
                            className={cn(
                              "inline-flex h-7 w-7 items-center justify-center rounded-full border transition-colors",
                              on ? "border-green-600 bg-green-600 text-white" : "border-dashed text-muted-foreground hover:border-primary",
                            )}
                          >
                            {on ? <Check size={14} /> : <Minus size={12} />}
                          </button>
                        ) : (
                          <span
                            title="連携の結果から自動で表示"
                            className={cn(
                              "inline-flex h-6 w-6 items-center justify-center rounded-full",
                              on ? "bg-green-100 text-green-700" : "text-muted-foreground/60",
                            )}
                          >
                            {on ? <Check size={13} /> : <Minus size={11} />}
                          </span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
