import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { format, isToday } from "date-fns";
import { ArrowLeft, Loader2, MessageSquare, Plus, Search, Send } from "lucide-react";
import { toast } from "sonner";
import { DashboardHeader } from "@/components/DashboardHeader";
import { Sidebar } from "@/components/Sidebar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/useAuth";
import { useAdminStore } from "@/hooks/useAdminStore";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import {
  SMS_LOG_COLUMNS,
  counterpartNumber,
  formatJpPhone,
  outboundStatus,
  toE164,
  type SmsLog,
} from "@/lib/smsLogs";

interface Thread {
  number: string;
  logs: SmsLog[];
  last: SmsLog;
  unread: number;
  customerId: string | null;
}

const localForm = (e164: string) => (e164.startsWith("+81") ? "0" + e164.slice(3) : e164);

export default function SmsInbox() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { user, loading: authLoading } = useAuth();
  const { store, loading: storeLoading } = useAdminStore();
  const storeId = store?.id;
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [logs, setLogs] = useState<SmsLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [names, setNames] = useState<Record<string, string>>({}); // key: customer_id or "phone:+81…"
  const [selected, setSelected] = useState<string | null>(toE164(searchParams.get("to")));
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [query, setQuery] = useState("");
  const [newOpen, setNewOpen] = useState(false);
  const [newNumber, setNewNumber] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!authLoading && !user) navigate("/login");
  }, [user, authLoading, navigate]);

  const upsertLog = useCallback((log: SmsLog) => {
    setLogs((prev) => {
      const i = prev.findIndex((l) => l.id === log.id);
      if (i === -1) return [...prev, log];
      const next = prev.slice();
      next[i] = log;
      return next;
    });
  }, []);

  // 初回読込＋Realtime購読
  useEffect(() => {
    if (storeLoading || !storeId) return;
    setLoading(true);
    supabase
      .from("sms_logs" as any)
      .select(SMS_LOG_COLUMNS)
      .eq("store_id", storeId)
      .order("created_at", { ascending: true })
      .limit(3000)
      .then(({ data, error }) => {
        if (error) toast.error(`読み込みに失敗しました: ${error.message}`);
        setLogs(((data as unknown) as SmsLog[]) ?? []);
        setLoading(false);
      });

    const channel = supabase
      .channel(`sms-inbox-${storeId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "sms_logs", filter: `store_id=eq.${storeId}` },
        (payload) => {
          if (payload.eventType === "DELETE") return;
          upsertLog(payload.new as SmsLog);
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [storeId, storeLoading, upsertLog]);

  const threads = useMemo<Thread[]>(() => {
    const map = new Map<string, SmsLog[]>();
    for (const log of logs) {
      const key = counterpartNumber(log);
      if (!key) continue;
      (map.get(key) ?? map.set(key, []).get(key)!).push(log);
    }
    return [...map.entries()]
      .map(([number, list]) => ({
        number,
        logs: list,
        last: list[list.length - 1],
        unread: list.filter((l) => l.direction === "inbound" && !l.is_read).length,
        customerId: [...list].reverse().find((l) => l.customer_id)?.customer_id ?? null,
      }))
      .sort((a, b) => b.last.created_at.localeCompare(a.last.created_at));
  }, [logs]);

  // 顧客名の解決（customer_id → 名前、無ければ電話番号で顧客マスタを照合）
  useEffect(() => {
    const ids = [...new Set(threads.map((t) => t.customerId).filter((v): v is string => !!v))].filter(
      (id) => !(id in names),
    );
    const phones = threads.filter((t) => !t.customerId && !(`phone:${t.number}` in names)).map((t) => t.number);
    if (ids.length === 0 && phones.length === 0) return;
    (async () => {
      const found: Record<string, string> = {};
      if (ids.length) {
        const { data } = await supabase.from("customers").select("id, name").in("id", ids);
        for (const c of data ?? []) found[c.id] = c.name;
      }
      if (phones.length) {
        const locals = phones.flatMap((p) => [localForm(p), formatJpPhone(p), p]);
        const { data } = await supabase.from("customers").select("name, phone").in("phone", locals);
        for (const p of phones) {
          const hit = (data ?? []).find((c) => toE164(c.phone) === p);
          found[`phone:${p}`] = hit?.name ?? "";
        }
      }
      setNames((prev) => ({ ...prev, ...found }));
    })();
  }, [threads]); // eslint-disable-line react-hooks/exhaustive-deps

  const nameOf = (t: Pick<Thread, "number" | "customerId">) =>
    (t.customerId && names[t.customerId]) || names[`phone:${t.number}`] || "";

  const current = threads.find((t) => t.number === selected) ?? null;

  // スレッドを開いたら未読の受信を既読に
  useEffect(() => {
    if (!current || !storeId || current.unread === 0) return;
    const unreadIds = current.logs.filter((l) => l.direction === "inbound" && !l.is_read).map((l) => l.id);
    setLogs((prev) => prev.map((l) => (unreadIds.includes(l.id) ? { ...l, is_read: true } : l)));
    supabase.from("sms_logs" as any).update({ is_read: true }).in("id", unreadIds).then(({ error }) => {
      if (error) toast.error("既読の更新に失敗しました");
    });
  }, [current?.number, current?.unread, storeId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [selected, current?.logs.length]);

  const openThread = (number: string | null) => {
    setSelected(number);
    setDraft("");
    if (number) setSearchParams({ to: number }, { replace: true });
    else setSearchParams({}, { replace: true });
  };

  const send = async () => {
    const text = draft.trim();
    if (!selected || !text || !storeId) return;
    setSending(true);
    const { data, error } = await supabase.functions.invoke("send-sms", {
      body: { to: selected, body: text, store_id: storeId, customer_id: current?.customerId ?? null },
    });
    setSending(false);
    let failure: string | null = (data as any)?.error ?? null;
    if (error) {
      // send-sms は失敗時も JSON でエラー内容を返すので、それを優先して表示する
      const detail = await (error as any).context?.json?.().catch(() => null);
      failure = detail?.error || detail?.message || error.message;
    }
    if (failure) {
      toast.error(`送信に失敗しました: ${failure}`);
      return;
    }
    setDraft("");
  };

  const startNew = () => {
    const num = toE164(newNumber);
    if (!num) {
      toast.error("電話番号の形式が正しくありません");
      return;
    }
    setNewOpen(false);
    setNewNumber("");
    openThread(num);
  };

  const filtered = threads.filter((t) => {
    if (!query.trim()) return true;
    const q = query.trim().replace(/-/g, "");
    return nameOf(t).includes(query.trim()) || localForm(t.number).includes(q) || t.number.includes(q);
  });

  const displayName = (t: Pick<Thread, "number" | "customerId">) => nameOf(t) || formatJpPhone(t.number);

  return (
    <div className="min-h-screen bg-background">
      <DashboardHeader onToggleSidebar={() => setSidebarOpen(!sidebarOpen)} />
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <main className="pt-[60px] md:ml-[240px] h-screen flex flex-col">
        <div className="flex-1 min-h-0 flex border-t">
          {/* スレッド一覧 */}
          <section className={cn("w-full md:w-80 md:border-r flex flex-col min-h-0", selected && "hidden md:flex")}>
            <div className="p-3 border-b space-y-2">
              <div className="flex items-center justify-between">
                <h1 className="text-lg font-bold flex items-center gap-2">
                  <MessageSquare size={18} className="text-primary" />SMS
                </h1>
                <Button size="sm" variant="outline" onClick={() => setNewOpen((v) => !v)}>
                  <Plus size={14} className="mr-1" />新規
                </Button>
              </div>
              {newOpen && (
                <div className="flex gap-2">
                  <Input
                    placeholder="090-1234-5678"
                    value={newNumber}
                    onChange={(e) => setNewNumber(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") startNew(); }}
                    className="h-9"
                  />
                  <Button size="sm" className="h-9" onClick={startNew}>開く</Button>
                </div>
              )}
              <div className="relative">
                <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input placeholder="名前・電話番号で検索" value={query} onChange={(e) => setQuery(e.target.value)} className="h-9 pl-8" />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto">
              {loading ? (
                <div className="py-10 text-center"><Loader2 size={18} className="animate-spin text-primary mx-auto" /></div>
              ) : filtered.length === 0 ? (
                <p className="text-center text-sm text-muted-foreground py-10">SMSのやり取りはまだありません</p>
              ) : (
                filtered.map((t) => (
                  <button
                    key={t.number}
                    onClick={() => openThread(t.number)}
                    className={cn(
                      "w-full text-left px-3 py-3 border-b flex gap-3 items-start hover:bg-muted/40",
                      selected === t.number && "bg-primary/5",
                    )}
                  >
                    <div className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold shrink-0">
                      {(nameOf(t) || "#").charAt(0)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className={cn("text-sm truncate", t.unread > 0 ? "font-bold" : "font-medium")}>
                          {nameOf(t) ? `${nameOf(t)}様` : formatJpPhone(t.number)}
                        </span>
                        <span className="text-[10px] text-muted-foreground shrink-0">
                          {isToday(new Date(t.last.created_at))
                            ? format(new Date(t.last.created_at), "HH:mm")
                            : format(new Date(t.last.created_at), "M/d")}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-2 mt-0.5">
                        <span className={cn("text-xs truncate", t.unread > 0 ? "text-foreground" : "text-muted-foreground")}>
                          {t.last.direction !== "inbound" && "あなた: "}{t.last.body}
                        </span>
                        {t.unread > 0 && (
                          <span className="min-w-5 h-5 px-1.5 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center shrink-0">
                            {t.unread}
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                ))
              )}
            </div>
          </section>

          {/* 会話 */}
          <section className={cn("flex-1 flex flex-col min-h-0", !selected && "hidden md:flex")}>
            {!selected ? (
              <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
                左の一覧からスレッドを選んでください
              </div>
            ) : (
              <>
                <div className="px-3 py-2.5 border-b flex items-center gap-2">
                  <button className="md:hidden p-1 -ml-1" onClick={() => openThread(null)} aria-label="戻る">
                    <ArrowLeft size={18} />
                  </button>
                  <div className="min-w-0">
                    <p className="font-bold text-sm truncate">
                      {current ? displayName(current) : formatJpPhone(selected)}
                      {current && nameOf(current) && " 様"}
                    </p>
                    <p className="text-[11px] text-muted-foreground">{formatJpPhone(selected)}</p>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto p-3 space-y-2 bg-[#8cabd9]/15">
                  {(current?.logs ?? []).length === 0 && (
                    <p className="text-center text-xs text-muted-foreground py-10">まだメッセージはありません。下の入力欄から送信できます。</p>
                  )}
                  {(current?.logs ?? []).map((log, i, arr) => {
                    const out = log.direction !== "inbound";
                    const st = out ? outboundStatus(log) : null;
                    const d = new Date(log.created_at);
                    const showDate = i === 0 || format(new Date(arr[i - 1].created_at), "yyyyMMdd") !== format(d, "yyyyMMdd");
                    return (
                      <div key={log.id}>
                        {showDate && (
                          <div className="text-center my-2">
                            <span className="text-[10px] bg-black/20 text-white px-2 py-0.5 rounded-full">{format(d, "yyyy/M/d")}</span>
                          </div>
                        )}
                        <div className={cn("flex items-end gap-1.5", out ? "justify-end" : "justify-start")}>
                          {out && (
                            <div className="flex flex-col items-end text-[10px] text-muted-foreground shrink-0">
                              {st && <span className={cn("px-1.5 py-0.5 rounded-full font-medium mb-0.5", st.className)}>{st.label}</span>}
                              {format(d, "HH:mm")}
                            </div>
                          )}
                          <div
                            className={cn(
                              "max-w-[75%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap break-words shadow-sm",
                              out ? "bg-[#06c755] text-white rounded-br-sm" : "bg-white text-foreground rounded-bl-sm",
                            )}
                          >
                            {log.body}
                          </div>
                          {!out && <span className="text-[10px] text-muted-foreground shrink-0">{format(d, "HH:mm")}</span>}
                        </div>
                        {out && st?.label.startsWith("失敗") && log.error_message && (
                          <p className="text-right text-[10px] text-rose-600 mt-0.5">{log.error_message}</p>
                        )}
                      </div>
                    );
                  })}
                  <div ref={bottomRef} />
                </div>

                <div className="border-t p-2 flex gap-2 items-end">
                  <Textarea
                    rows={2}
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); send(); }
                    }}
                    placeholder="メッセージを入力（⌘/Ctrl+Enterで送信）"
                    className="min-h-[44px] resize-none"
                  />
                  <Button onClick={send} disabled={sending || !draft.trim()} className="h-11 shrink-0">
                    {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                  </Button>
                </div>
              </>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}
