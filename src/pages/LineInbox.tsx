import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { format, isToday } from "date-fns";
import { ArrowLeft, Bot, CheckCircle2, Loader2, MessageCircle, Send, Sparkles, ImagePlus, Search, X, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { DashboardHeader } from "@/components/DashboardHeader";
import { Sidebar } from "@/components/Sidebar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LineMessageImage } from "@/components/line/LineMessageImage";
import { Textarea } from "@/components/ui/textarea";
import { LineCustomerSettingsDialog, useLineCustomerSettings } from "@/components/line/LineCustomerSettingsDialog";
import { useAuth } from "@/hooks/useAuth";
import { useAdminStore } from "@/hooks/useAdminStore";
import { supabase } from "@/integrations/supabase/client";
import { prepareLineImage } from "@/lib/lineImageUpload";
import { cn } from "@/lib/utils";
import {
  LINE_THREAD_COLUMNS,
  LINE_MESSAGE_COLUMNS,
  MAX_LINE_IMAGE_BYTES,
  mergeLineMessages,
  filterLineThreads,
  STATUS_LABEL,
  needsStaff,
  waitingInfo,
  type LineMessage,
  type LineThread,
} from "@/lib/lineInbox";

// LINE対応：お客様用の公式LINEに届いたメッセージを見て、ここから返信するか「対応済み」にする。
// LINE公式アカウントのアプリで返信したことはシステムから分からないので、そちらで返したら「対応済み」を押す。

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const untyped = (table: string) => (supabase as any).from(table);

export default function LineInbox() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { user, loading: authLoading } = useAuth();
  const { store } = useAdminStore();
  const storeId = store?.id ?? null;
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { settings, canManage, reload: reloadSettings } = useLineCustomerSettings(storeId);

  const [threads, setThreads] = useState<LineThread[]>([]);
  const [messages, setMessages] = useState<LineMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string | null>(searchParams.get("thread"));
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState<"send" | "draft" | "handled" | null>(null);
  const [now, setNow] = useState(Date.now());
  const [query, setQuery] = useState("");
  const [pendingOnly, setPendingOnly] = useState(false);
  const [threadLimit, setThreadLimit] = useState(200);
  const [hasOlder, setHasOlder] = useState(false);
  const [messageLoading, setMessageLoading] = useState(false);
  const [image, setImage] = useState<{ name: string; data: string; preview: string } | null>(null);
  const imageInput = useRef<HTMLInputElement>(null);
  const retryRef = useRef<{ signature: string; id: string } | null>(null);
  const sendingRef = useRef(false);
  const scopeRef = useRef("");
  scopeRef.current = `${storeId}:${selected}`;
  const loadVersion = useRef(0);
  const historyLoadedRef = useRef(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!authLoading && !user) navigate("/login");
  }, [user, authLoading, navigate]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const loadThreads = useCallback(async () => {
    if (!storeId) return;
    const scope = storeId;
    const { data, error } = await untyped("line_customer_threads")
      .select(LINE_THREAD_COLUMNS)
      .eq("store_id", storeId)
      .order("last_message_at", { ascending: false })
      .limit(threadLimit);
    if (!scopeRef.current.startsWith(`${scope}:`)) return;
    if (error) { toast.error(error.message); setLoading(false); return; }
    setThreads((data ?? []) as LineThread[]);
    setLoading(false);
  }, [storeId, threadLimit]);

  const loadMessages = useCallback(async (threadId: string, olderThan?: LineMessage) => {
    if (!storeId) return;
    const scope = `${storeId}:${threadId}`;
    const version = loadVersion.current;
    let request = untyped("line_customer_messages").select(LINE_MESSAGE_COLUMNS)
      .eq("store_id", storeId).eq("thread_id", threadId)
      .order("created_at", { ascending: false }).order("id", { ascending: false }).limit(51);
    if (olderThan) request = request.or(`created_at.lt.${olderThan.created_at},and(created_at.eq.${olderThan.created_at},id.lt.${olderThan.id})`);
    const { data, error } = await request;
    if (scopeRef.current !== scope || loadVersion.current !== version) return;
    if (error) { toast.error(`会話を読み込めません：${error.message}`); return; }
    const page = (data ?? []) as LineMessage[];
    setMessages((old) => mergeLineMessages(old, page.slice(0, 50)));
    if (olderThan || !historyLoadedRef.current) { setHasOlder(page.length > 50); historyLoadedRef.current = true; }
  }, [storeId]);

  useEffect(() => { setLoading(true); void loadThreads(); }, [loadThreads]);
  useEffect(() => {
    loadVersion.current += 1;
    setMessages([]);
    historyLoadedRef.current = false;
    setDraft("");
    setImage(null);
    retryRef.current = null;
    setHasOlder(false);
    setMessageLoading(true);
    if (selected) void loadMessages(selected).finally(() => { if (scopeRef.current === `${storeId}:${selected}`) setMessageLoading(false); });
    else setMessageLoading(false);
  }, [selected, storeId, loadMessages]);
  useEffect(() => { setThreads([]); setThreadLimit(200); }, [storeId]);

  // 新しいメッセージ・状態の変化をすぐ反映する
  useEffect(() => {
    if (!storeId) return;
    const channel = supabase
      .channel(`line-inbox-${storeId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "line_customer_threads", filter: `store_id=eq.${storeId}` }, () => {
        void loadThreads();
        if (selected) void loadMessages(selected);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "line_customer_messages", filter: `store_id=eq.${storeId}` }, (payload) => {
        const message = payload.new as LineMessage;
        if (message.thread_id === selected) setMessages((old) => mergeLineMessages(old, [message]));
      })
      .subscribe();
    const poll = window.setInterval(() => {
      if (document.hidden) return;
      void loadThreads();
      if (selected) void loadMessages(selected);
    }, 30_000);
    return () => {
      void supabase.removeChannel(channel);
      window.clearInterval(poll);
    };
  }, [storeId, selected, loadThreads, loadMessages]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages[messages.length - 1]?.id, selected]);

  const openThread = (id: string | null) => {
    setSelected(id);
    setDraft("");
    setImage(null);
    const next = new URLSearchParams(searchParams);
    if (id) next.set("thread", id);
    else next.delete("thread");
    setSearchParams(next, { replace: true });
  };

  const sorted = useMemo(() => filterLineThreads(threads, query, pendingOnly), [threads, query, pendingOnly]);
  const current = threads.find((t) => t.id === selected && t.store_id === storeId) ?? null;
  const autoMinutes = settings?.enabled && settings.autoReply ? settings.waitMinutes : null;
  const waitingCount = threads.filter((t) => t.status === "waiting" || t.status === "failed").length;

  const invokeReply = async (body: Record<string, unknown>) => {
    const { data, error } = await supabase.functions.invoke("line-customer-reply", { body });
    if (error) {
      const detail = await (error as { context?: { json?: () => Promise<{ error?: string }> } }).context?.json?.().catch(() => null);
      throw new Error(detail?.error || error.message);
    }
    return data as Record<string, unknown>;
  };

  const send = async () => {
    if (!current || (!draft.trim() && !image) || sendingRef.current || busy) return;
    sendingRef.current = true;
    const scope = scopeRef.current;
    const signature = `${scope}:${draft.trim()}:${image?.data ?? ""}`;
    if (retryRef.current?.signature !== signature) retryRef.current = { signature, id: crypto.randomUUID() };
    const retryKey = retryRef.current.id;
    setBusy("send");
    try {
      await invokeReply({ action: "send", threadId: current.id, text: draft.trim(), image: image?.data, retryKey });
      if (scopeRef.current === scope) { setDraft(""); setImage(null); retryRef.current = null; }
      await Promise.all([loadThreads(), loadMessages(current.id)]);
    } catch (err) {
      toast.error(`送れませんでした：${err instanceof Error ? err.message : String(err)}`);
    } finally {
      sendingRef.current = false;
      setBusy(null);
    }
  };

  const makeDraft = async () => {
    if (!current) return;
    const scope = scopeRef.current;
    setBusy("draft");
    try {
      const result = await invokeReply({ action: "draft", threadId: current.id });
      if (scopeRef.current !== scope) return;
      if (result.noReplyNeeded) toast.info("返事が要らないメッセージのようです");
      else setDraft(String(result.draft ?? ""));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  };

  const markHandled = async () => {
    if (!current) return;
    setBusy("handled");
    const { error } = await (supabase.rpc as unknown as (n: string, a: Record<string, unknown>) => Promise<{ error: { message: string } | null }>)(
      "mark_line_thread_handled", { p_thread_id: current.id },
    );
    setBusy(null);
    if (error) toast.error(error.message);
    else void loadThreads();
  };

  const selectImage = async (file: File | undefined) => {
    if (!file) return;
    if (!["image/jpeg", "image/png"].includes(file.type) || file.size > MAX_LINE_IMAGE_BYTES) {
      toast.error("5MB以下のJPEG・PNGを選んでください"); return;
    }
    const scope = scopeRef.current;
    try {
      const preview = await prepareLineImage(file);
      if (scopeRef.current !== scope) return;
      setImage({ name: file.name, data: preview.split(",")[1], preview });
    } catch (err) { toast.error(err instanceof Error ? err.message : "画像を読み込めませんでした"); }
  };

  const nameOf = (t: Pick<LineThread, "display_name">) => (t.display_name ? `${t.display_name}様` : "お客様");

  return (
    <div className="min-h-screen bg-background">
      <DashboardHeader onToggleSidebar={() => setSidebarOpen(!sidebarOpen)} />
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <main className="pt-[60px] md:ml-[240px] h-[100dvh] flex flex-col">
        <div className="flex-1 min-h-0 flex border-t">
          {/* 会話の一覧 */}
          <section className={cn("w-full md:w-80 md:shrink-0 md:border-r flex flex-col min-h-0", selected && "hidden md:flex")}>
            <div className="p-3 border-b space-y-2">
              <div className="flex items-center justify-between">
                <h1 className="text-lg font-bold flex items-center gap-2">
                  <MessageCircle size={18} className="text-[#06c755]" />LINE対応
                  {waitingCount > 0 && <span className="rounded-full bg-rose-500 px-2 text-xs text-white">{waitingCount}</span>}
                </h1>
                {canManage && storeId && <LineCustomerSettingsDialog storeId={storeId} settings={settings} onSaved={() => void reloadSettings()} />}
              </div>
              <p className="text-[11px] text-muted-foreground">
                {settings && !settings.enabled ? "受信保存はオフです。設定から有効にしてください。"
                  : autoMinutes ? `${autoMinutes}分後に自動で一次対応します。ここから返信すると対応済みになります。`
                  : "公式LINEの会話をここで確認・返信できます。"}
              </p>
              <div className="relative"><Search size={14} className="absolute left-2.5 top-2.5 text-muted-foreground" />
                <Input aria-label="会話を検索" placeholder="名前・最新メッセージで検索" className="pl-8 h-9" value={query} onChange={(e) => setQuery(e.target.value)} />
              </div>
              <div className="flex gap-1">
                <Button variant={!pendingOnly ? "secondary" : "ghost"} size="sm" onClick={() => setPendingOnly(false)}>すべて</Button>
                <Button variant={pendingOnly ? "secondary" : "ghost"} size="sm" onClick={() => setPendingOnly(true)}>未対応</Button>
                <Button variant="ghost" size="icon" className="ml-auto h-8 w-8" aria-label="会話を更新" onClick={() => { void loadThreads(); if (selected) void loadMessages(selected); }}><RefreshCw size={14} /></Button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto">
              {loading ? (
                <div className="py-10 text-center"><Loader2 size={18} className="animate-spin text-primary mx-auto" /></div>
              ) : sorted.length === 0 ? (
                <p className="text-center text-sm text-muted-foreground py-10 px-4">
                  {threads.length ? "該当する会話がありません" : "連携開始後に届いたLINEがここに表示されます"}{settings && !settings.configured ? "（右上の「設定」で公式LINEをつないでください）" : ""}
                </p>
              ) : (
                sorted.map((t) => {
                  const wait = waitingInfo(t, now, autoMinutes);
                  const badge = STATUS_LABEL[t.status];
                  return (
                    <button
                      key={t.id}
                      onClick={() => openThread(t.id)}
                      disabled={busy !== null}
                      className={cn("w-full text-left px-3 py-3 border-b flex gap-3 items-start hover:bg-muted/40", selected === t.id && "bg-primary/5")}
                    >
                      {t.picture_url
                        ? <img src={t.picture_url} alt="" className="w-10 h-10 rounded-full object-cover shrink-0" />
                        : <div className="w-10 h-10 rounded-full bg-[#06c755]/15 text-[#06c755] flex items-center justify-center font-bold shrink-0">{(t.display_name || "客").charAt(0)}</div>}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <span className={cn("text-sm truncate", needsStaff(t) ? "font-bold" : "font-medium")}>{nameOf(t)}</span>
                          <span className="text-[10px] text-muted-foreground shrink-0">
                            {isToday(new Date(t.last_message_at)) ? format(new Date(t.last_message_at), "HH:mm") : format(new Date(t.last_message_at), "M/d")}
                          </span>
                        </div>
                        <p className="text-xs truncate text-muted-foreground mt-0.5">{t.last_message_text}</p>
                        <div className="mt-1 flex items-center gap-1.5">
                          <span className={cn("rounded-full px-1.5 py-0.5 text-[10px] font-medium", badge.className)}>{badge.label}</span>
                          {wait && (
                            <span className="text-[10px] text-muted-foreground">
                              {wait.elapsed}分経過{wait.remaining !== null && wait.remaining > 0 && `・あと${wait.remaining}分で自動応答`}
                            </span>
                          )}
                        </div>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
            {threads.length >= threadLimit && <Button variant="ghost" size="sm" onClick={() => setThreadLimit((n) => n + 200)}>さらに会話を読み込む</Button>}
          </section>

          {/* 会話 */}
          <section className={cn("flex-1 min-w-0 flex flex-col min-h-0", !selected && "hidden md:flex")}>
            {!current ? (
              <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">左の一覧から会話を選んでください</div>
            ) : (
              <>
                <div className="px-3 py-2.5 border-b flex items-center gap-2">
                  <button className="md:hidden p-1 -ml-1" onClick={() => openThread(null)} disabled={busy !== null} aria-label="戻る"><ArrowLeft size={18} /></button>
                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-sm truncate">{nameOf(current)}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {STATUS_LABEL[current.status].label}
                      {current.error && `：${current.error}`}
                    </p>
                  </div>
                  {needsStaff(current) && (
                    <Button size="sm" variant="outline" onClick={() => void markHandled()} disabled={busy !== null}>
                      {busy === "handled" ? <Loader2 size={14} className="mr-1 animate-spin" /> : <CheckCircle2 size={14} className="mr-1" />}対応済み
                    </Button>
                  )}
                </div>

                <div className="flex-1 overflow-y-auto p-3 space-y-2 bg-[#8cabd9]/15">
                  {hasOlder && <div className="text-center"><Button size="sm" variant="secondary" disabled={messageLoading} onClick={async () => {
                    if (!selected || !messages[0]) return;
                    setMessageLoading(true);
                    try { await loadMessages(selected, messages[0]); } finally { setMessageLoading(false); }
                  }}>以前のメッセージを読み込む</Button></div>}
                  {messageLoading && <Loader2 size={18} className="animate-spin mx-auto" />}
                  {!messageLoading && !messages.length && <p className="text-center text-sm text-muted-foreground">この会話にはまだメッセージがありません</p>}
                  {messages.map((m, i, arr) => {
                    const out = m.direction !== "in";
                    const d = new Date(m.created_at);
                    const showDate = i === 0 || format(new Date(arr[i - 1].created_at), "yyyyMMdd") !== format(d, "yyyyMMdd");
                    return (
                      <div key={m.id}>
                        {showDate && (
                          <div className="text-center my-2">
                            <span className="text-[10px] bg-black/20 text-white px-2 py-0.5 rounded-full">{format(d, "yyyy/M/d")}</span>
                          </div>
                        )}
                        <div className={cn("flex items-end gap-1.5", out ? "justify-end" : "justify-start")}>
                          {out && (
                            <div className="flex flex-col items-end text-[10px] text-muted-foreground shrink-0">
                              {m.direction === "ai" && <span className="flex items-center gap-0.5 text-violet-700"><Bot size={11} />自動</span>}
                              {m.delivery_status === "sending" ? "送信中" : m.delivery_status === "failed" ? "送信失敗" : "送信済み"}
                              <span>{format(d, "HH:mm")}</span>
                            </div>
                          )}
                          <div className={cn(
                            "max-w-[75%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap break-words shadow-sm",
                            out ? (m.direction === "ai" ? "bg-violet-500 text-white rounded-br-sm" : "bg-[#06c755] text-white rounded-br-sm") : "bg-white text-foreground rounded-bl-sm",
                          )}>
                            {m.message_type === "image" && <LineMessageImage message={m} />}
                            {m.text !== "[画像]" && m.text}
                            {m.delivery_status === "failed" && <p className="text-xs mt-1">送信できませんでした。入力欄から再試行してください。</p>}
                          </div>
                          {!out && <span className="text-[10px] text-muted-foreground shrink-0">{format(d, "HH:mm")}</span>}
                        </div>
                      </div>
                    );
                  })}
                  <p className="text-center text-[10px] text-muted-foreground pt-2">LINEのアプリから送った返信はここには出ません</p>
                  <div ref={bottomRef} />
                </div>

                <div className="border-t p-2 space-y-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
                  {image && <div className="flex gap-2 items-center rounded-lg bg-muted p-2">
                    <img src={image.preview} alt="送信する画像" className="h-16 w-16 rounded object-cover" />
                    <span className="text-xs truncate flex-1">{image.name}</span>
                    <Button size="icon" variant="ghost" disabled={busy !== null} aria-label="添付画像を取り消す" onClick={() => setImage(null)}><X size={14} /></Button>
                  </div>}
                  <div className="flex gap-2 items-end">
                  <input ref={imageInput} type="file" accept="image/jpeg,image/png" className="hidden" aria-label="送信する画像を選択" onChange={(e) => { void selectImage(e.target.files?.[0]); e.target.value = ""; }} />
                  <Button variant="outline" size="icon" disabled={busy !== null} aria-label="画像を添付（5MBまで・大きい画像は自動縮小）" onClick={() => imageInput.current?.click()}><ImagePlus size={17} /></Button>
                  <Textarea
                    rows={2}
                    disabled={busy !== null}
                    maxLength={4000}
                    aria-label="返信内容"
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => { if (!e.nativeEvent.isComposing && e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void send(); } }}
                    placeholder="返信を入力（⌘/Ctrl+Enterで送信）"
                    className="min-h-[44px] resize-none"
                  />
                  <div className="flex flex-col gap-1 shrink-0">
                    <Button variant="outline" size="sm" onClick={() => void makeDraft()} disabled={busy !== null} title="AIで下書き" aria-label="AIで下書き">
                      {busy === "draft" ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                    </Button>
                    <Button size="sm" onClick={() => void send()} aria-label="返信を送信" disabled={busy !== null || (!draft.trim() && !image)}>
                      {busy === "send" ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                    </Button>
                  </div>
                  </div>
                  <p className="text-[10px] text-muted-foreground">ここからの返信はLINEの配信通数に含まれます。{draft.length > 3500 && `${draft.length}/4000文字`}</p>
                </div>
              </>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}
