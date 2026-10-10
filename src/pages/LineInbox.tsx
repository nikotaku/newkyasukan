import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { format, isToday } from "date-fns";
import { ArrowLeft, Bot, CheckCircle2, Loader2, MessageCircle, Send, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { DashboardHeader } from "@/components/DashboardHeader";
import { Sidebar } from "@/components/Sidebar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { LineCustomerSettingsDialog, useLineCustomerSettings } from "@/components/line/LineCustomerSettingsDialog";
import { useAuth } from "@/hooks/useAuth";
import { useAdminStore } from "@/hooks/useAdminStore";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import {
  LINE_THREAD_COLUMNS,
  STATUS_LABEL,
  needsStaff,
  sortThreads,
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
    const { data, error } = await untyped("line_customer_threads")
      .select(LINE_THREAD_COLUMNS)
      .eq("store_id", storeId)
      .order("last_message_at", { ascending: false })
      .limit(200);
    if (error) toast.error(error.message);
    setThreads((data ?? []) as LineThread[]);
    setLoading(false);
  }, [storeId]);

  const loadMessages = useCallback(async (threadId: string) => {
    const { data } = await untyped("line_customer_messages")
      .select("id,thread_id,direction,message_type,text,created_at")
      .eq("thread_id", threadId)
      .order("created_at", { ascending: true })
      .limit(300);
    setMessages((data ?? []) as LineMessage[]);
  }, []);

  useEffect(() => { void loadThreads(); }, [loadThreads]);
  useEffect(() => {
    if (selected) void loadMessages(selected);
    else setMessages([]);
  }, [selected, loadMessages]);

  // 新しいメッセージ・状態の変化をすぐ反映する
  useEffect(() => {
    if (!storeId) return;
    const channel = supabase
      .channel(`line-inbox-${storeId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "line_customer_threads", filter: `store_id=eq.${storeId}` }, () => {
        void loadThreads();
        if (selected) void loadMessages(selected);
      })
      .subscribe();
    const poll = window.setInterval(() => {
      void loadThreads();
      if (selected) void loadMessages(selected);
    }, 60_000);
    return () => {
      void supabase.removeChannel(channel);
      window.clearInterval(poll);
    };
  }, [storeId, selected, loadThreads, loadMessages]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length, selected]);

  const openThread = (id: string | null) => {
    setSelected(id);
    setDraft("");
    const next = new URLSearchParams(searchParams);
    if (id) next.set("thread", id);
    else next.delete("thread");
    setSearchParams(next, { replace: true });
  };

  const sorted = useMemo(() => sortThreads(threads), [threads]);
  const current = threads.find((t) => t.id === selected) ?? null;
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
    if (!current || !draft.trim()) return;
    setBusy("send");
    try {
      await invokeReply({ action: "send", threadId: current.id, text: draft.trim(), retryKey: crypto.randomUUID() });
      setDraft("");
      await Promise.all([loadThreads(), loadMessages(current.id)]);
    } catch (err) {
      toast.error(`送れませんでした：${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(null);
    }
  };

  const makeDraft = async () => {
    if (!current) return;
    setBusy("draft");
    try {
      const result = await invokeReply({ action: "draft", threadId: current.id });
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

  const nameOf = (t: Pick<LineThread, "display_name">) => (t.display_name ? `${t.display_name}様` : "お客様");

  return (
    <div className="min-h-screen bg-background">
      <DashboardHeader onToggleSidebar={() => setSidebarOpen(!sidebarOpen)} />
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <main className="pt-[60px] md:ml-[240px] h-screen flex flex-col">
        <div className="flex-1 min-h-0 flex border-t">
          {/* 会話の一覧 */}
          <section className={cn("w-full md:w-80 md:border-r flex flex-col min-h-0", selected && "hidden md:flex")}>
            <div className="p-3 border-b space-y-2">
              <div className="flex items-center justify-between">
                <h1 className="text-lg font-bold flex items-center gap-2">
                  <MessageCircle size={18} className="text-[#06c755]" />LINE対応
                  {waitingCount > 0 && <span className="rounded-full bg-rose-500 px-2 text-xs text-white">{waitingCount}</span>}
                </h1>
                {canManage && storeId && <LineCustomerSettingsDialog storeId={storeId} settings={settings} onSaved={() => void reloadSettings()} />}
              </div>
              <p className="text-[11px] text-muted-foreground">
                {settings && !settings.enabled
                  ? "見張りはオフです（設定でオンにすると、届いたLINEをスマホに通知します）"
                  : autoMinutes
                    ? `${autoMinutes}分たっても返事が無ければ、AIが一次対応の返事を送ります。LINEのアプリで返したら「対応済み」を押してください`
                    : "自動応答はオフです。LINEのアプリで返したら「対応済み」を押してください"}
              </p>
            </div>
            <div className="flex-1 overflow-y-auto">
              {loading ? (
                <div className="py-10 text-center"><Loader2 size={18} className="animate-spin text-primary mx-auto" /></div>
              ) : sorted.length === 0 ? (
                <p className="text-center text-sm text-muted-foreground py-10 px-4">
                  まだメッセージはありません{settings && !settings.configured ? "（右上の「設定」で公式LINEをつないでください）" : ""}
                </p>
              ) : (
                sorted.map((t) => {
                  const wait = waitingInfo(t, now, autoMinutes);
                  const badge = STATUS_LABEL[t.status];
                  return (
                    <button
                      key={t.id}
                      onClick={() => openThread(t.id)}
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
          </section>

          {/* 会話 */}
          <section className={cn("flex-1 flex flex-col min-h-0", !selected && "hidden md:flex")}>
            {!current ? (
              <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">左の一覧から会話を選んでください</div>
            ) : (
              <>
                <div className="px-3 py-2.5 border-b flex items-center gap-2">
                  <button className="md:hidden p-1 -ml-1" onClick={() => openThread(null)} aria-label="戻る"><ArrowLeft size={18} /></button>
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
                              {format(d, "HH:mm")}
                            </div>
                          )}
                          <div className={cn(
                            "max-w-[75%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap break-words shadow-sm",
                            out ? (m.direction === "ai" ? "bg-violet-500 text-white rounded-br-sm" : "bg-[#06c755] text-white rounded-br-sm") : "bg-white text-foreground rounded-bl-sm",
                          )}>
                            {m.text}
                          </div>
                          {!out && <span className="text-[10px] text-muted-foreground shrink-0">{format(d, "HH:mm")}</span>}
                        </div>
                      </div>
                    );
                  })}
                  <p className="text-center text-[10px] text-muted-foreground pt-2">LINEのアプリから送った返信はここには出ません</p>
                  <div ref={bottomRef} />
                </div>

                <div className="p-2 flex gap-2 items-end border-t">
                  <Textarea
                    rows={2}
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void send(); } }}
                    placeholder="返信を入力（⌘/Ctrl+Enterで送信）"
                    className="min-h-[44px] resize-none"
                  />
                  <div className="flex flex-col gap-1 shrink-0">
                    <Button variant="outline" size="sm" onClick={() => void makeDraft()} disabled={busy !== null} title="AIで下書き">
                      {busy === "draft" ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                    </Button>
                    <Button size="sm" onClick={() => void send()} disabled={busy !== null || !draft.trim()}>
                      {busy === "send" ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                    </Button>
                  </div>
                </div>
              </>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}
