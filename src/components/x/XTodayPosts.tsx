import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type TextareaHTMLAttributes } from "react";
import { Check, ChevronLeft, ChevronRight, Copy, ExternalLink, ImageIcon, Loader2, RefreshCw, Sparkles, TriangleAlert, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { getCastBookingUrl, getCustomDomainBaseUrl } from "@/lib/bookingUrl";
import { DEFAULT_RESERVATION_INTERVAL_MINUTES } from "@/lib/availability";
import { cn } from "@/lib/utils";
import {
  buildAiFacts,
  buildDailyPosts,
  businessDate,
  dayLabel,
  nextAvailableFor,
  shiftDate,
  weekdayOf,
  xWeightedLength,
  X_MAX_WEIGHT,
  type XCast,
  type XDailyPost,
  type XPostContext,
} from "@/lib/xDailyPosts";
import { renderEyecatch, shareOrDownloadImage } from "@/lib/xEyecatch";
import type { XOperationsPlan } from "@/lib/xOperationsPlan";

interface StoreLite {
  id: string;
  name: string;
  custom_domain?: string | null;
}

interface SavedPost {
  account_key: string;
  slot_key: string;
  text: string | null;
  text_source: "ai" | "edited" | null;
  posted_at: string | null;
  posted_text: string | null;
}

type ShiftRow = {
  shift_date: string;
  cast_id: string;
  start_time: string;
  end_time: string;
  approval_status: string | null;
  casts: { id: string; name: string; photo: string | null; shop_comment: string | null; profile: string | null; is_active: boolean; is_visible: boolean } | null;
};

const ACCOUNT_COLORS: Record<string, string> = {
  shukyaku: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
  kyujin: "bg-pink-500/15 text-pink-700 dark:text-pink-300",
  tencho: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
};

// x_daily_posts・store_info は生成された型に無いので、ここだけ型を外して使う
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const untypedFrom = (table: "x_daily_posts" | "store_info") => (supabase as any).from(table);
const postsTable = () => untypedFrom("x_daily_posts");

const tokyoNow = () => {
  const now = new Date(Date.now() + 9 * 60 * 60 * 1000);
  return { minutes: now.getUTCHours() * 60 + now.getUTCMinutes(), label: now.toISOString().slice(11, 16) };
};

const discountLabel = (type: string, value: number) =>
  /percent/.test(type) ? `${value}%OFF` : `${Number(value).toLocaleString("ja-JP")}円引き`;

// 折り返しも含めて全文が見える高さに合わせる
function AutoTextarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    element.style.height = "auto";
    element.style.height = `${element.scrollHeight + 2}px`;
  }, [props.value]);
  return <textarea ref={ref} {...props} />;
}

export function XTodayPosts({ plan, store }: { plan: XOperationsPlan; store: StoreLite }) {
  const [date, setDate] = useState(() => businessDate(new Date()));
  const [context, setContext] = useState<XPostContext | null>(null);
  const [saved, setSaved] = useState<Record<string, SavedPost>>({});
  const [loading, setLoading] = useState(true);
  const [accountFilter, setAccountFilter] = useState<string>("all");
  const [hidePosted, setHidePosted] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [generating, setGenerating] = useState<Record<string, boolean>>({});
  const [aiFailed, setAiFailed] = useState<Record<string, boolean>>({});
  const [image, setImage] = useState<{ post: XDailyPost; url: string; blob: Blob } | null>(null);
  const [imageLoading, setImageLoading] = useState<string | null>(null);
  const aiQueue = useRef(new Set<string>());

  const todayBusinessDate = businessDate(new Date());
  const isToday = date === todayBusinessDate;
  const siteUrl = getCustomDomainBaseUrl(store.custom_domain) ?? window.location.origin;
  const keyOf = (accountKey: string, slotKey: string) => `${accountKey}::${slotKey}`;

  const load = useCallback(async () => {
    setLoading(true);
    const tomorrow = shiftDate(date, 1);
    const [shiftsRes, reservationsRes, settingsRes, discountsRes, reviewsRes, infoRes, savedRes] = await Promise.all([
      supabase
        .from("shifts")
        .select("shift_date,cast_id,start_time,end_time,approval_status,casts(id,name,photo,shop_comment,profile,is_active,is_visible)")
        .eq("store_id", store.id)
        .in("shift_date", [date, tomorrow])
        .order("start_time"),
      supabase
        .from("reservations")
        .select("cast_id,start_time,duration,status")
        .eq("store_id", store.id)
        .eq("reservation_date", date)
        .neq("status", "cancelled"),
      supabase.from("shop_settings").select("reservation_interval_minutes").eq("store_id", store.id).limit(1).maybeSingle(),
      supabase.from("discounts").select("name,discount_type,discount_value").eq("store_id", store.id).eq("is_active", true).order("discount_value", { ascending: false }),
      supabase
        .from("customer_reviews")
        .select("therapist_name,review_text,rating")
        .eq("store_id", store.id)
        .eq("is_published", true)
        .order("created_at", { ascending: false })
        .limit(5),
      untypedFrom("store_info").select("phone").eq("store_id", store.id).limit(1).maybeSingle(),
      postsTable().select("account_key,slot_key,text,text_source,posted_at,posted_text").eq("store_id", store.id).eq("post_date", date),
    ]);
    if (shiftsRes.error) toast.error(`出勤を読み込めませんでした: ${shiftsRes.error.message}`);
    if (savedRes.error) toast.error(`投稿チェックを読み込めませんでした: ${savedRes.error.message}`);

    const interval = (settingsRes.data as { reservation_interval_minutes?: number } | null)?.reservation_interval_minutes ?? DEFAULT_RESERVATION_INTERVAL_MINUTES;
    const reservations = (reservationsRes.data ?? []) as Array<{ cast_id: string; start_time: string; duration: number }>;
    const now = tokyoNow();
    const bookingBase = getCustomDomainBaseUrl(store.custom_domain) ?? window.location.origin;

    const castsFor = (day: string, withAvailability: boolean): XCast[] => {
      const seen = new Set<string>();
      return ((shiftsRes.data ?? []) as unknown as ShiftRow[])
        .filter((s) => s.shift_date === day && s.approval_status !== "rejected" && s.casts?.is_active && s.casts?.is_visible)
        .filter((s) => (seen.has(s.cast_id) ? false : (seen.add(s.cast_id), true)))
        .map((s) => ({
          id: s.cast_id,
          name: s.casts!.name,
          photo: s.casts!.photo,
          start: s.start_time.slice(0, 5),
          end: s.end_time.slice(0, 5),
          nextAvailable: withAvailability
            ? nextAvailableFor(
                { start: s.start_time.slice(0, 5), end: s.end_time.slice(0, 5) },
                reservations.filter((r) => r.cast_id === s.cast_id),
                interval,
                date === businessDate(new Date()) ? now.minutes : null,
              )
            : null,
          bookingUrl: getCastBookingUrl(bookingBase, s.cast_id),
          intro: s.casts!.shop_comment || s.casts!.profile,
        }));
    };

    const phone = ((infoRes.data as { phone?: string } | null)?.phone ?? "").replace(/\D/g, "");
    setContext({
      date,
      isToday: date === businessDate(new Date()),
      nowLabel: now.label,
      storeName: store.name,
      siteUrl: bookingBase,
      phoneDisplay: phone ? phone.replace(/^(0\d{2})(\d{4})(\d{4})$/, "$1-$2-$3") : null,
      today: castsFor(date, true),
      tomorrow: castsFor(tomorrow, false),
      discounts: ((discountsRes.data ?? []) as Array<{ name: string; discount_type: string; discount_value: number }>).map((d) => ({
        name: d.name,
        label: discountLabel(d.discount_type, d.discount_value),
      })),
      reviews: ((reviewsRes.data ?? []) as Array<{ therapist_name: string | null; review_text: string | null; rating: number | null }>).map((r) => ({
        therapistName: r.therapist_name,
        text: r.review_text ?? "",
        rating: r.rating,
      })),
    });
    setSaved(Object.fromEntries(((savedRes.data ?? []) as SavedPost[]).map((row) => [keyOf(row.account_key, row.slot_key), row])));
    setDrafts({});
    setLoading(false);
  }, [date, store.id, store.name, store.custom_domain]);

  useEffect(() => {
    void load();
  }, [load]);

  const posts = useMemo(() => (context ? buildDailyPosts(plan.accounts, context) : []), [plan, context]);

  const example = (post: XDailyPost) =>
    plan.accounts.find((a) => a.key === post.accountKey)?.daily.find((r) => `${r.time.trim()}|${r.type.trim()}` === post.slotKey)?.example ?? "";

  const textOf = (post: XDailyPost) => {
    const key = keyOf(post.accountKey, post.slotKey);
    if (drafts[key] !== undefined) return drafts[key];
    const row = saved[key];
    if (row?.posted_at && row.posted_text) return row.posted_text;
    if (row?.text) return row.text;
    if (post.kind === "ai") return aiFailed[key] ? example(post) : "";
    return post.text;
  };

  const upsert = async (post: XDailyPost, patch: Partial<SavedPost> & Record<string, unknown>) => {
    const key = keyOf(post.accountKey, post.slotKey);
    const current = saved[key];
    const row = {
      store_id: store.id,
      post_date: date,
      account_key: post.accountKey,
      slot_key: post.slotKey,
      text: current?.text ?? null,
      text_source: current?.text_source ?? null,
      posted_at: current?.posted_at ?? null,
      posted_text: current?.posted_text ?? null,
      ...patch,
      updated_at: new Date().toISOString(),
    };
    const { error } = await postsTable().upsert(row as never, { onConflict: "store_id,post_date,account_key,slot_key" });
    if (error) {
      toast.error(`保存できませんでした: ${error.message}`);
      return false;
    }
    setSaved((prev) => ({ ...prev, [key]: { ...(prev[key] ?? {}), ...row } as SavedPost }));
    return true;
  };

  // AIで作る投稿は、その日はじめて開いたときに1回だけ作って保存する（今日と先の日だけ）
  const generateAi = useCallback(async (post: XDailyPost, force = false) => {
    if (!context) return;
    const key = keyOf(post.accountKey, post.slotKey);
    if (aiQueue.current.has(key) && !force) return;
    aiQueue.current.add(key);
    setGenerating((prev) => ({ ...prev, [key]: true }));
    const account = plan.accounts.find((a) => a.key === post.accountKey);
    const slot = account?.daily.find((r) => `${r.time.trim()}|${r.type.trim()}` === post.slotKey);
    const theme = account?.weekly.find((w) => w.day === weekdayOf(date));
    const { data, error } = await supabase.functions.invoke("generate-cast-content", {
      body: {
        type: "x_post",
        xAccount: account ? { name: account.name, purpose: account.purpose, target: account.target, tone: account.tone } : {},
        xSlot: slot ?? {},
        xTheme: theme ? { day: theme.day, theme: theme.theme, detail: theme.detail } : {},
        xRules: plan.rules,
        xFacts: buildAiFacts(context),
      },
    });
    setGenerating((prev) => ({ ...prev, [key]: false }));
    const content = typeof data?.content === "string" ? data.content.trim() : "";
    if (error || !content) {
      setAiFailed((prev) => ({ ...prev, [key]: true }));
      if (force) toast.error("AIで作れませんでした。例文を表示しています");
      return;
    }
    setAiFailed((prev) => ({ ...prev, [key]: false }));
    setDrafts((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
    await upsert(post, { text: content, text_source: "ai" });
    // upsert は saved を更新するので、ここでは何もしない
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [context, plan, date, store.id, saved]);

  useEffect(() => {
    if (loading || !context || date < todayBusinessDate) return;
    const pending = posts.filter((post) => {
      const key = keyOf(post.accountKey, post.slotKey);
      return post.kind === "ai" && !saved[key]?.text && !saved[key]?.posted_at && !aiQueue.current.has(key);
    });
    // 1件ずつ順番に作る（同時に投げない）
    void (async () => {
      for (const post of pending) await generateAi(post);
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, context, posts]);

  useEffect(() => {
    aiQueue.current = new Set();
    setAiFailed({});
  }, [date]);

  const copy = async (post: XDailyPost) => {
    const text = textOf(post);
    try {
      await navigator.clipboard.writeText(text);
      toast.success("コピーしました");
    } catch {
      toast.error("コピーできませんでした。文章を長押ししてコピーしてください");
    }
  };

  const togglePosted = async (post: XDailyPost, checked: boolean) => {
    const text = textOf(post);
    const { data } = await supabase.auth.getUser();
    await upsert(post, checked
      ? { posted_at: new Date().toISOString(), posted_text: text, posted_by: data.user?.id ?? null }
      : { posted_at: null, posted_text: null, posted_by: null });
  };

  const saveDraft = async (post: XDailyPost) => {
    const key = keyOf(post.accountKey, post.slotKey);
    const draft = drafts[key];
    if (draft === undefined) return;
    const base = saved[key]?.text ?? (post.kind === "ai" ? "" : post.text);
    if (draft === base) return;
    await upsert(post, { text: draft, text_source: "edited" });
    setDrafts((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const resetText = async (post: XDailyPost) => {
    const key = keyOf(post.accountKey, post.slotKey);
    setDrafts((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
    if (post.kind === "ai") {
      await generateAi(post, true);
    } else if (saved[key]?.text) {
      await upsert(post, { text: null, text_source: null });
    } else {
      await load();
    }
  };

  const openImage = async (post: XDailyPost) => {
    if (!context) return;
    const key = keyOf(post.accountKey, post.slotKey);
    setImageLoading(key);
    try {
      const blob = await renderEyecatch(post, textOf(post), context);
      setImage((prev) => {
        if (prev) URL.revokeObjectURL(prev.url);
        return { post, blob, url: URL.createObjectURL(blob) };
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "画像を作れませんでした");
    } finally {
      setImageLoading(null);
    }
  };

  const visible = posts.filter((post) => {
    if (accountFilter !== "all" && post.accountKey !== accountFilter) return false;
    if (hidePosted && saved[keyOf(post.accountKey, post.slotKey)]?.posted_at) return false;
    return true;
  });
  const postedCount = posts.filter((post) => saved[keyOf(post.accountKey, post.slotKey)]?.posted_at).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3">
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => setDate(shiftDate(date, -1))} className="rounded p-2 hover:bg-muted" aria-label="前の日">
            <ChevronLeft size={18} />
          </button>
          <p className="min-w-[7rem] text-center text-lg font-bold">{dayLabel(date)}</p>
          <button type="button" onClick={() => setDate(shiftDate(date, 1))} className="rounded p-2 hover:bg-muted" aria-label="次の日">
            <ChevronRight size={18} />
          </button>
          {!isToday && (
            <Button variant="outline" size="sm" className="ml-1 h-8" onClick={() => setDate(todayBusinessDate)}>今日</Button>
          )}
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <p className="text-xs text-muted-foreground">投稿済み</p>
            <p className="text-lg font-bold tabular-nums">{postedCount}<span className="text-sm text-muted-foreground">/{posts.length}</span></p>
          </div>
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
            <RefreshCw size={14} className={cn("mr-1", loading && "animate-spin")} />最新にする
          </Button>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div className="h-full bg-green-600 transition-all" style={{ width: `${posts.length ? (postedCount / posts.length) * 100 : 0}%` }} />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {[{ key: "all", name: "すべて" }, ...plan.accounts.map((a) => ({ key: a.key, name: a.name }))].map((option) => (
          <button
            key={option.key}
            type="button"
            onClick={() => setAccountFilter(option.key)}
            className={cn(
              "rounded-full border px-3 py-1 text-xs",
              accountFilter === option.key ? "border-primary bg-primary/10 font-semibold text-primary" : "text-muted-foreground",
            )}
          >
            {option.name}
          </button>
        ))}
        <label className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground">
          <input type="checkbox" checked={hidePosted} onChange={(e) => setHidePosted(e.target.checked)} />
          投稿済みを隠す
        </label>
      </div>

      <p className="text-xs text-muted-foreground">
        出勤・空き枠・イベント・口コミは開くたびに最新のデータで作ります（空き枠は「最新にする」で今の時刻の空きに更新）。求人・店長の投稿はその日はじめて開いたときにAIが作り、保存されます。文章はその場で直せます。
      </p>

      {loading && !context ? (
        <div className="py-16 text-center"><Loader2 className="inline-block animate-spin text-primary" /></div>
      ) : visible.length === 0 ? (
        <div className="rounded-lg border border-dashed py-12 text-center text-sm text-muted-foreground">
          {posts.length ? "ぜんぶ投稿済みです🎉" : "運用表に投稿スケジュールがありません"}
        </div>
      ) : (
        <div className="space-y-3">
          {visible.map((post) => {
            const key = keyOf(post.accountKey, post.slotKey);
            const row = saved[key];
            const posted = Boolean(row?.posted_at);
            const text = textOf(post);
            const weight = xWeightedLength(text);
            const busy = generating[key];
            const edited = row?.text_source === "edited" || drafts[key] !== undefined;
            return (
              <div key={key} className={cn("rounded-lg border p-3 transition-colors", posted ? "border-green-300 bg-green-50/60 dark:bg-green-950/20" : "bg-card")}>
                <div className="flex items-start gap-3">
                  <button
                    type="button"
                    onClick={() => void togglePosted(post, !posted)}
                    className={cn(
                      "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border-2 transition-colors",
                      posted ? "border-green-600 bg-green-600 text-white" : "border-muted-foreground/40 hover:border-green-600",
                    )}
                    aria-label={posted ? "投稿済みを外す" : "投稿したにする"}
                    aria-pressed={posted}
                  >
                    {posted && <Check size={18} strokeWidth={3} />}
                  </button>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="font-mono text-sm font-semibold">{post.time}</span>
                      <span className={cn("rounded px-1.5 py-0.5 text-[11px] font-semibold", ACCOUNT_COLORS[post.accountKey] ?? "bg-muted")}>{post.accountName}</span>
                      <span className="text-sm font-medium">{post.type}</span>
                      {post.kind === "ai" && <span className="inline-flex items-center gap-0.5 text-[11px] text-violet-600"><Sparkles size={11} />AI</span>}
                      {edited && <span className="text-[11px] text-muted-foreground">手直し済み</span>}
                      {posted && row?.posted_at && (
                        <span className="text-[11px] text-green-700">投稿済み {new Date(row.posted_at).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" })}</span>
                      )}
                    </div>
                    {post.warning && !posted && (
                      <p className="mt-1 flex items-center gap-1 text-[11px] text-amber-700"><TriangleAlert size={12} />{post.warning}</p>
                    )}
                    {busy && !text ? (
                      <div className="mt-2 flex items-center gap-2 rounded-md bg-muted/50 px-3 py-4 text-sm text-muted-foreground">
                        <Loader2 size={14} className="animate-spin" />AIで今日の文を作っています…
                      </div>
                    ) : (
                      <AutoTextarea
                        value={text}
                        onChange={(e) => setDrafts((prev) => ({ ...prev, [key]: e.target.value }))}
                        onBlur={() => void saveDraft(post)}
                        readOnly={posted}
                        rows={3}
                        className={cn(
                          "mt-2 block w-full resize-none rounded-md border bg-background px-3 py-2 text-sm leading-relaxed outline-none focus:ring-1 focus:ring-primary",
                          posted && "opacity-80",
                        )}
                      />
                    )}
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      <Button size="sm" className="h-9" onClick={() => void copy(post)} disabled={!text}>
                        <Copy size={14} className="mr-1" />コピー
                      </Button>
                      <Button size="sm" variant="outline" className="h-9" onClick={() => void openImage(post)} disabled={imageLoading === key || !text}>
                        {imageLoading === key ? <Loader2 size={14} className="mr-1 animate-spin" /> : <ImageIcon size={14} className="mr-1" />}画像
                      </Button>
                      <Button size="sm" variant="outline" className="h-9" asChild>
                        <a href={`https://x.com/intent/post?text=${encodeURIComponent(text)}`} target="_blank" rel="noreferrer">
                          <ExternalLink size={14} className="mr-1" />Xで開く
                        </a>
                      </Button>
                      {!posted && (
                        <Button size="sm" variant="ghost" className="h-9 text-muted-foreground" onClick={() => void resetText(post)} disabled={busy}>
                          {post.kind === "ai" ? <><Sparkles size={14} className="mr-1" />作り直す</> : <><Undo2 size={14} className="mr-1" />元に戻す</>}
                        </Button>
                      )}
                      <span className={cn("ml-auto text-[11px] tabular-nums", weight > X_MAX_WEIGHT ? "font-semibold text-destructive" : "text-muted-foreground")}>
                        {weight}/{X_MAX_WEIGHT}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={Boolean(image)} onOpenChange={(open) => { if (!open && image) { URL.revokeObjectURL(image.url); setImage(null); } }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{image?.post.time} {image?.post.type} の画像</DialogTitle>
          </DialogHeader>
          {image && (
            <div className="space-y-3">
              <img src={image.url} alt={`${image.post.type}のアイキャッチ画像`} className="w-full rounded-lg border" />
              <div className="flex flex-wrap gap-2">
                <Button
                  className="flex-1"
                  onClick={async () => {
                    const result = await shareOrDownloadImage(image.blob, `x_${date}_${image.post.time.replace(":", "")}.png`);
                    if (result === "downloaded") toast.success("画像を保存しました");
                  }}
                >
                  <ImageIcon size={14} className="mr-1" />保存・共有
                </Button>
                <Button variant="outline" onClick={() => void openImage(image.post)}>
                  <RefreshCw size={14} className="mr-1" />作り直す
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">スマホでは「保存・共有」から写真に保存するか、そのままXに添付できます。</p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
