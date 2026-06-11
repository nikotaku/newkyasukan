import { useState, useEffect, useMemo } from "react";
import { format } from "date-fns";
import { ja } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Loader2, Search, Phone, Crown, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { getCustomerRank, daysSince, FOLLOWUP_METHODS } from "@/lib/customerRank";
import type { ProfileData } from "./CustomerPreferencesTab";

interface CustomerRow {
  id: string;
  name: string;
  phone: string;
  visit_count: number | null;
  total_spent: number | null;
  last_visited: string | null;
  last_cast_id: string | null;
  tags: string[] | null;
  notes: string | null;
  is_banned: boolean | null;
}

interface Followup {
  id: string;
  customer_id: string;
  followup_date: string;
  method: string | null;
  content: string | null;
  next_action_date: string | null;
}

interface VisitRow {
  reservation_date: string;
  course_name: string;
  price: number;
  cast_id: string | null;
  status: string;
}

type Filter = "all" | "inactive30" | "inactive60" | "vip" | "nextAction";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "すべて" },
  { key: "inactive30", label: "30日以上来店なし" },
  { key: "inactive60", label: "60日以上来店なし" },
  { key: "vip", label: "VIP" },
  { key: "nextAction", label: "次回アクションあり" },
];

export function CustomerSalesTab() {
  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [profiles, setProfiles] = useState<Map<string, ProfileData>>(new Map());
  const [followups, setFollowups] = useState<Followup[]>([]);
  const [castNames, setCastNames] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  // Karte dialog
  const [selected, setSelected] = useState<CustomerRow | null>(null);
  const [visits, setVisits] = useState<VisitRow[]>([]);
  const [visitsLoading, setVisitsLoading] = useState(false);
  const [fuForm, setFuForm] = useState({ followup_date: format(new Date(), "yyyy-MM-dd"), method: "電話", content: "", next_action_date: "" });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [custRes, profRes, fuRes, castRes] = await Promise.all([
        supabase
          .from("customers")
          .select("id, name, phone, visit_count, total_spent, last_visited, last_cast_id, tags, notes, is_banned")
          .order("last_visited", { ascending: false, nullsFirst: false }),
        supabase.from("customer_profiles").select("customer_id, preferred_pressure, concern_areas, conversation_level, ng_items, preference_notes"),
        supabase.from("customer_followups").select("id, customer_id, followup_date, method, content, next_action_date").order("followup_date", { ascending: false }),
        supabase.from("casts").select("id, name"),
      ]);
      if (custRes.error) throw custRes.error;
      setCustomers((custRes.data || []) as CustomerRow[]);
      const pmap = new Map<string, ProfileData>();
      for (const p of profRes.data || []) pmap.set(p.customer_id, p as ProfileData);
      setProfiles(pmap);
      setFollowups((fuRes.data || []) as Followup[]);
      setCastNames(new Map((castRes.data || []).map((c) => [c.id, c.name])));
    } catch (e) {
      console.error(e);
      toast.error("データの取得に失敗しました");
    } finally {
      setLoading(false);
    }
  };

  const latestFollowup = useMemo(() => {
    const map = new Map<string, Followup>();
    for (const f of followups) {
      if (!map.has(f.customer_id)) map.set(f.customer_id, f);
    }
    return map;
  }, [followups]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = customers;
    if (q) {
      list = list.filter(
        (c) => c.name?.toLowerCase().includes(q) || c.phone?.replace(/\D/g, "").includes(q.replace(/\D/g, "")),
      );
    }
    switch (filter) {
      case "inactive30":
        list = list.filter((c) => (daysSince(c.last_visited) ?? Infinity) >= 30 && c.last_visited);
        break;
      case "inactive60":
        list = list.filter((c) => (daysSince(c.last_visited) ?? Infinity) >= 60 && c.last_visited);
        break;
      case "vip":
        list = list.filter((c) => getCustomerRank(c).label === "VIP");
        break;
      case "nextAction":
        list = list.filter((c) => latestFollowup.get(c.id)?.next_action_date);
        break;
    }
    return list;
  }, [customers, search, filter, latestFollowup]);

  const openKarte = async (c: CustomerRow) => {
    setSelected(c);
    setFuForm({ followup_date: format(new Date(), "yyyy-MM-dd"), method: "電話", content: "", next_action_date: "" });
    setVisitsLoading(true);
    const phone = (c.phone || "").replace(/[-\s]/g, "");
    const { data } = await supabase
      .from("reservations")
      .select("reservation_date, course_name, price, cast_id, status")
      .or(`customer_phone.eq.${phone},customer_phone.eq.${c.phone}`)
      .neq("status", "cancelled")
      .order("reservation_date", { ascending: false })
      .limit(10);
    setVisits((data || []) as VisitRow[]);
    setVisitsLoading(false);
  };

  const handleAddFollowup = async () => {
    if (!selected || !fuForm.content.trim()) {
      toast.error("内容を入力してください");
      return;
    }
    setSaving(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from("customer_followups")
        .insert({
          customer_id: selected.id,
          followup_date: fuForm.followup_date,
          method: fuForm.method,
          content: fuForm.content.trim(),
          next_action_date: fuForm.next_action_date || null,
          created_by: userData.user?.id ?? null,
        })
        .select()
        .single();
      if (error) throw error;
      setFollowups((prev) => [data as Followup, ...prev]);
      setFuForm({ followup_date: format(new Date(), "yyyy-MM-dd"), method: "電話", content: "", next_action_date: "" });
      toast.success("フォロー履歴を追加しました");
    } catch (e) {
      console.error(e);
      toast.error("追加に失敗しました");
    } finally {
      setSaving(false);
    }
  };

  const toggleVip = async () => {
    if (!selected) return;
    const tags = selected.tags ?? [];
    const next = tags.includes("VIP") ? tags.filter((t) => t !== "VIP") : [...tags, "VIP"];
    const { error } = await supabase.from("customers").update({ tags: next }).eq("id", selected.id);
    if (error) {
      toast.error("更新に失敗しました");
      return;
    }
    const updated = { ...selected, tags: next };
    setSelected(updated);
    setCustomers((prev) => prev.map((c) => (c.id === selected.id ? updated : c)));
  };

  if (loading) {
    return <div className="py-16 text-center"><Loader2 className="h-6 w-6 animate-spin text-primary mx-auto" /></div>;
  }

  const selectedProfile = selected ? profiles.get(selected.id) : null;
  const selectedFollowups = selected ? followups.filter((f) => f.customer_id === selected.id) : [];

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 mb-3 shrink-0">
        <div className="relative max-w-sm flex-1 min-w-[200px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="名前・電話番号で検索"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-9"
          />
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={cn(
                "text-xs px-2.5 py-1.5 rounded-full border transition-colors",
                filter === f.key
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-card hover:bg-muted/50",
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-muted/80 backdrop-blur-sm">
            <tr className="text-left text-xs text-muted-foreground">
              <th className="px-3 py-2 font-medium">ランク</th>
              <th className="px-3 py-2 font-medium">名前</th>
              <th className="px-3 py-2 font-medium text-right">来店回数</th>
              <th className="px-3 py-2 font-medium text-right">累計売上</th>
              <th className="px-3 py-2 font-medium">最終来店</th>
              <th className="px-3 py-2 font-medium text-right">経過日数</th>
              <th className="px-3 py-2 font-medium">前回担当</th>
              <th className="px-3 py-2 font-medium">最終フォロー</th>
              <th className="px-3 py-2 font-medium">次回アクション</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {filtered.map((c) => {
              const rank = getCustomerRank(c);
              const days = daysSince(c.last_visited);
              const fu = latestFollowup.get(c.id);
              return (
                <tr key={c.id} className="cursor-pointer hover:bg-muted/40" onClick={() => openKarte(c)}>
                  <td className="px-3 py-2">
                    <span className={cn("text-[11px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap", rank.className)}>
                      {rank.label}
                    </span>
                  </td>
                  <td className="px-3 py-2 font-medium whitespace-nowrap">
                    {c.name}
                    {c.is_banned && <span className="ml-1.5 text-[10px] text-red-600 font-bold">⛔出禁</span>}
                  </td>
                  <td className="px-3 py-2 text-right">{c.visit_count ?? 0}回</td>
                  <td className="px-3 py-2 text-right">¥{(c.total_spent ?? 0).toLocaleString()}</td>
                  <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">
                    {c.last_visited ? format(new Date(c.last_visited), "yyyy/M/d", { locale: ja }) : "—"}
                  </td>
                  <td className={cn(
                    "px-3 py-2 text-right whitespace-nowrap font-medium",
                    days == null ? "text-muted-foreground" : days >= 60 ? "text-rose-600" : days >= 30 ? "text-amber-600" : "text-green-600",
                  )}>
                    {days != null ? `${days}日` : "—"}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">{c.last_cast_id ? castNames.get(c.last_cast_id) ?? "—" : "—"}</td>
                  <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">
                    {fu ? `${format(new Date(fu.followup_date), "M/d")} ${fu.method ?? ""}` : "—"}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    {fu?.next_action_date ? (
                      <span className="text-primary font-medium">{format(new Date(fu.next_action_date), "M/d")}</span>
                    ) : "—"}
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr><td colSpan={9} className="px-3 py-10 text-center text-muted-foreground">該当する顧客がいません</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* 顧客カルテダイアログ */}
      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          {selected && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 flex-wrap">
                  {selected.name} さんのカルテ
                  <span className={cn("text-[11px] font-semibold px-2 py-0.5 rounded-full", getCustomerRank(selected).className)}>
                    {getCustomerRank(selected).label}
                  </span>
                  {selected.is_banned && <span className="text-xs text-red-600 font-bold">⛔出入り禁止</span>}
                </DialogTitle>
              </DialogHeader>

              <div className="space-y-5">
                {/* 基本情報 */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="rounded-lg border p-2.5 text-center">
                    <p className="text-[11px] text-muted-foreground">来店回数</p>
                    <p className="font-bold">{selected.visit_count ?? 0}回</p>
                  </div>
                  <div className="rounded-lg border p-2.5 text-center">
                    <p className="text-[11px] text-muted-foreground">累計売上</p>
                    <p className="font-bold">¥{(selected.total_spent ?? 0).toLocaleString()}</p>
                  </div>
                  <div className="rounded-lg border p-2.5 text-center">
                    <p className="text-[11px] text-muted-foreground">最終来店</p>
                    <p className="font-bold">{selected.last_visited ? format(new Date(selected.last_visited), "M/d") : "—"}</p>
                  </div>
                  <div className="rounded-lg border p-2.5 text-center">
                    <p className="text-[11px] text-muted-foreground">経過日数</p>
                    <p className="font-bold">{daysSince(selected.last_visited) ?? "—"}{daysSince(selected.last_visited) != null && "日"}</p>
                  </div>
                </div>

                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Phone size={13} />{selected.phone}
                  <Button
                    variant="outline"
                    size="sm"
                    className="ml-auto h-7 text-xs"
                    onClick={toggleVip}
                  >
                    <Crown size={12} className="mr-1 text-purple-500" />
                    {(selected.tags ?? []).includes("VIP") ? "VIP解除" : "VIPにする"}
                  </Button>
                </div>

                {/* 好み */}
                <div className="rounded-lg border p-3 space-y-1.5">
                  <p className="text-xs font-semibold text-muted-foreground">好み（電話ヒアリング）</p>
                  {selectedProfile ? (
                    <div className="text-sm space-y-1">
                      {selectedProfile.preferred_pressure && <p>圧：{selectedProfile.preferred_pressure}</p>}
                      {selectedProfile.concern_areas?.length ? <p>気になる部位：{selectedProfile.concern_areas.join("・")}</p> : null}
                      {selectedProfile.conversation_level && <p>会話：{selectedProfile.conversation_level}</p>}
                      {selectedProfile.ng_items && <p className="text-orange-600">NG：{selectedProfile.ng_items}</p>}
                      {selectedProfile.preference_notes && <p className="text-muted-foreground">{selectedProfile.preference_notes}</p>}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">未登録（「好み」タブから登録できます）</p>
                  )}
                  {selected.notes && (
                    <p className="text-xs text-muted-foreground pt-1 border-t mt-2">顧客メモ：{selected.notes}</p>
                  )}
                </div>

                {/* 来店履歴 */}
                <div>
                  <p className="text-xs font-semibold text-muted-foreground mb-1.5 flex items-center gap-1">
                    <Clock size={11} />来店履歴（直近10件）
                  </p>
                  {visitsLoading ? (
                    <div className="py-4 text-center"><Loader2 size={14} className="animate-spin text-primary mx-auto" /></div>
                  ) : visits.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-2">来店履歴がありません</p>
                  ) : (
                    <div className="rounded-lg border divide-y">
                      {visits.map((v, i) => (
                        <div key={i} className="px-3 py-2 flex justify-between items-center text-sm">
                          <span className="text-muted-foreground">
                            {format(new Date(v.reservation_date), "yyyy/M/d(E)", { locale: ja })}　{v.course_name}
                            {v.cast_id && <span className="ml-1">／{castNames.get(v.cast_id) ?? ""}</span>}
                          </span>
                          <span className="font-medium">¥{v.price.toLocaleString()}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* フォロー履歴 */}
                <div>
                  <p className="text-xs font-semibold text-muted-foreground mb-1.5">営業フォロー履歴</p>
                  <div className="rounded-lg border p-3 space-y-2.5 mb-2 bg-muted/20">
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <Label className="text-[11px]">日付</Label>
                        <Input
                          type="date"
                          value={fuForm.followup_date}
                          onChange={(e) => setFuForm({ ...fuForm, followup_date: e.target.value })}
                          className="mt-0.5 h-8 text-xs"
                        />
                      </div>
                      <div>
                        <Label className="text-[11px]">手段</Label>
                        <Select value={fuForm.method} onValueChange={(v) => setFuForm({ ...fuForm, method: v })}>
                          <SelectTrigger className="mt-0.5 h-8 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {FOLLOWUP_METHODS.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label className="text-[11px]">次回アクション日</Label>
                        <Input
                          type="date"
                          value={fuForm.next_action_date}
                          onChange={(e) => setFuForm({ ...fuForm, next_action_date: e.target.value })}
                          className="mt-0.5 h-8 text-xs"
                        />
                      </div>
                    </div>
                    <Textarea
                      placeholder="例：誕生月クーポンの案内を送信。来週再連絡予定。"
                      value={fuForm.content}
                      onChange={(e) => setFuForm({ ...fuForm, content: e.target.value })}
                      rows={2}
                      className="text-sm"
                    />
                    <Button size="sm" onClick={handleAddFollowup} disabled={saving} className="w-full h-8">
                      {saving && <Loader2 size={12} className="mr-1.5 animate-spin" />}
                      フォロー履歴を追加
                    </Button>
                  </div>
                  {selectedFollowups.length > 0 && (
                    <div className="rounded-lg border divide-y">
                      {selectedFollowups.map((f) => (
                        <div key={f.id} className="px-3 py-2 text-sm">
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <span className="font-medium text-foreground">{format(new Date(f.followup_date), "yyyy/M/d")}</span>
                            {f.method && <span className="bg-muted px-1.5 py-0.5 rounded">{f.method}</span>}
                            {f.next_action_date && (
                              <span className="text-primary">次回: {format(new Date(f.next_action_date), "M/d")}</span>
                            )}
                          </div>
                          {f.content && <p className="mt-0.5">{f.content}</p>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
