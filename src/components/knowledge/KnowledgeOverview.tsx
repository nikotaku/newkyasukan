import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { addDays, differenceInCalendarDays, format } from "date-fns";
import { AlertTriangle, BookOpen, FileText, KeyRound, Loader2, Search, Wallet } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";

// ナレッジダッシュボードの「概要」：全体の検索（ナレッジ・ID・契約・固定費）と数字のカード、更新・終了が近いものの一覧。
// 押すとそれぞれのタブ（契約は詳細画面）を開く。

type Row = Record<string, any>;
type Hit = { kind: "knowledge" | "passwords" | "contracts" | "money"; id: string; title: string; sub?: string | null };

const db = supabase as unknown as { from: (table: string) => any };
const KIND_LABEL: Record<Hit["kind"], string> = { knowledge: "ナレッジ", passwords: "ID・パスワード", contracts: "契約", money: "固定費" };
const yen = (n: number) => `¥${Math.round(n).toLocaleString()}`;

export function KnowledgeOverview({ onOpen }: { onOpen: (tab: string, params?: Record<string, string>) => void }) {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<{ articles: Row[]; passwords: Row[]; contracts: Row[]; fixed: Row[] }>({ articles: [], passwords: [], contracts: [], fixed: [] });
  const [query, setQuery] = useState("");

  useEffect(() => {
    void (async () => {
      const [a, p, c, f] = await Promise.all([
        db.from("knowledge_articles").select("id,title,content,category"),
        db.from("password_entries").select("id,name,category,email,login_id,url"),
        db.from("facility_contracts").select("id,name,tags,contract_status,management_company,end_date,amount"),
        db.from("business_fixed_costs").select("id,item_name,amount,renewal_date,payment_day,contract_holder"),
      ]);
      setData({ articles: a.data ?? [], passwords: p.data ?? [], contracts: c.data ?? [], fixed: f.data ?? [] });
      setLoading(false);
    })();
  }, []);

  const hits = useMemo<Hit[]>(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const has = (...values: unknown[]) => values.some((v) => typeof v === "string" && v.toLowerCase().includes(q));
    return [
      ...data.articles.filter((r) => has(r.title, r.content, r.category)).map((r) => ({ kind: "knowledge" as const, id: r.id, title: r.title, sub: r.category })),
      ...data.passwords.filter((r) => has(r.name, r.category, r.email, r.login_id, r.url)).map((r) => ({ kind: "passwords" as const, id: r.id, title: r.name, sub: r.category })),
      ...data.contracts.filter((r) => has(r.name, r.management_company, ...(r.tags ?? []))).map((r) => ({ kind: "contracts" as const, id: r.id, title: r.name, sub: (r.tags ?? [])[0] })),
      ...data.fixed.filter((r) => has(r.item_name, r.contract_holder)).map((r) => ({ kind: "money" as const, id: r.id, title: r.item_name, sub: r.amount ? yen(r.amount) : null })),
    ].slice(0, 40);
  }, [data, query]);

  const open = (hit: Hit) => {
    if (hit.kind === "contracts") navigate(`/facilities/contracts/${hit.id}`);
    else if (hit.kind === "knowledge") onOpen("knowledge", { article: hit.id });
    else if (hit.kind === "passwords") onOpen("passwords", { q: hit.title });
    else onOpen("money");
  };

  // 3か月以内に終わる契約・更新日が来る固定費
  const due = useMemo(() => {
    const today = new Date();
    const limit = addDays(today, 90);
    const list: Array<{ key: string; date: Date; title: string; label: string; go: () => void }> = [];
    for (const c of data.contracts) {
      if (!c.end_date || c.contract_status === "解約済み") continue;
      const date = new Date(`${c.end_date}T00:00:00`);
      if (date <= limit) list.push({ key: `c${c.id}`, date, title: c.name, label: "契約の終了", go: () => navigate(`/facilities/contracts/${c.id}`) });
    }
    for (const f of data.fixed) {
      if (!f.renewal_date) continue;
      const date = new Date(`${f.renewal_date}T00:00:00`);
      if (date <= limit) list.push({ key: `f${f.id}`, date, title: f.item_name, label: "固定費の更新", go: () => onOpen("money") });
    }
    return list.sort((a, b) => a.date.getTime() - b.date.getTime()).map((item) => ({ ...item, days: differenceInCalendarDays(item.date, today) }));
  }, [data, navigate, onOpen]);

  const monthlyFixed = data.fixed.reduce((sum, f) => sum + (Number(f.amount) || 0), 0);
  const activeContracts = data.contracts.filter((c) => c.contract_status !== "解約済み").length;

  const stats = [
    { label: "月の固定費", value: yen(monthlyFixed), sub: `${data.fixed.length}件`, icon: Wallet, tab: "money" },
    { label: "契約", value: `${activeContracts}件`, sub: "解約済みを除く", icon: FileText, tab: "contracts" },
    { label: "ID・パスワード", value: `${data.passwords.length}件`, sub: "サービスのログイン", icon: KeyRound, tab: "passwords" },
    { label: "ナレッジ", value: `${data.articles.length}件`, sub: "記事", icon: BookOpen, tab: "knowledge" },
  ];

  return (
    <div className="space-y-5">
      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input value={query} onChange={(e) => setQuery(e.target.value)} className="h-11 pl-9"
          placeholder="ナレッジ・ID・契約・固定費をまとめて探す" />
      </div>

      {query.trim() ? (
        <Card>
          <CardContent className="p-0">
            {hits.length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground">見つかりません</p>
            ) : (
              <ul className="divide-y">
                {hits.map((hit) => (
                  <li key={`${hit.kind}${hit.id}`}>
                    <button type="button" onClick={() => open(hit)} className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-muted/50">
                      <span className="w-24 shrink-0 text-xs text-muted-foreground">{KIND_LABEL[hit.kind]}</span>
                      <span className="min-w-0 flex-1 truncate text-sm font-medium">{hit.title}</span>
                      {hit.sub && <span className="shrink-0 text-xs text-muted-foreground">{hit.sub}</span>}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      ) : loading ? (
        <div className="flex justify-center py-10"><Loader2 className="animate-spin text-muted-foreground" /></div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {stats.map(({ label, value, sub, icon: Icon, tab }) => (
              <button key={label} type="button" onClick={() => onOpen(tab)} className="text-left">
                <Card className="h-full transition-colors hover:border-primary/40">
                  <CardContent className="p-4">
                    <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><Icon size={14} />{label}</p>
                    <p className="mt-1 text-xl font-bold tabular-nums">{value}</p>
                    <p className="text-xs text-muted-foreground">{sub}</p>
                  </CardContent>
                </Card>
              </button>
            ))}
          </div>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base"><AlertTriangle size={16} className="text-amber-500" />3か月以内に終わる・更新するもの</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {due.length === 0 ? (
                <p className="px-4 pb-4 text-sm text-muted-foreground">ありません</p>
              ) : (
                <ul className="divide-y">
                  {due.map((item) => (
                    <li key={item.key}>
                      <button type="button" onClick={item.go} className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-muted/50">
                        <span className={`w-20 shrink-0 text-xs font-semibold ${item.days < 0 ? "text-rose-600" : item.days <= 30 ? "text-amber-600" : "text-muted-foreground"}`}>
                          {item.days < 0 ? `${-item.days}日過ぎ` : item.days === 0 ? "今日" : `あと${item.days}日`}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-sm font-medium">{item.title}</span>
                        <span className="shrink-0 text-xs text-muted-foreground">{item.label}・{format(item.date, "M/d")}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
