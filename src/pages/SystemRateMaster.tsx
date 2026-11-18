// 料金・割引・決済（正本）。コース・オプション・指名・割引・決済方法を1ページにまとめる。
// ふだんは見るだけの表（面談用ページと同じ見た目）。右上の「編集」で編集画面になり、まとめて保存する。
// どこから直しても DB のトリガーが rate_master_changes に「いつ・誰が・どれを・どう」を残し、下の「変更の記録」に出す。
// ここで保存した値が、セラピストのマイページの「バック表」・HPの料金・予約入力・面談用ページ・予約案内ページにそのまま出る。
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowDown, ArrowUp, History, Loader2, Pencil, Plus, RotateCcw, Save, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { AdminPageShell } from "@/components/AdminPageShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import {
  CHANGE_TABLE_LABEL,
  describeRateChange,
  discountRowsFromRecords,
  discountValueLabel,
  paymentRowsFromRecords,
  planDiscountSave,
  planPaymentSave,
  planRateSave,
  RATE_KIND_LABEL,
  RATE_KINDS,
  RATE_TABLE_NAME,
  rowsFromRecords,
  shopBack,
  validateDiscountRows,
  validatePaymentRows,
  validateRateRows,
  type CourseRecord,
  type DiscountRecord,
  type DiscountRow,
  type NominationRecord,
  type OptionRecord,
  type PaymentRecord,
  type PaymentRow,
  type RateChangeRecord,
  type RateKind,
  type RateRow,
} from "@/lib/rateMaster";

const yen = (value: number) => `¥${value.toLocaleString()}`;

/** 数字の欄（空なら null） */
function NumberCell({ value, onChange, placeholder, className = "w-24", decimal = false }: {
  value: number | null;
  onChange: (value: number | null) => void;
  placeholder?: string;
  className?: string;
  decimal?: boolean;
}) {
  return (
    <Input
      inputMode={decimal ? "decimal" : "numeric"}
      className={`h-8 px-2 text-right tabular-nums ${className}`}
      value={value === null ? "" : String(value)}
      placeholder={placeholder}
      onChange={(event) => {
        const text = event.target.value.replace(decimal ? /[^\d.]/g : /[^\d]/g, "");
        onChange(text === "" ? null : Number(text));
      }}
    />
  );
}

/** 見るだけの表（面談用ページと同じ形：内容／料金／バック／店落ち） */
function ViewSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-2 text-base font-bold">{title}</h2>
      <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">{children}</div>
    </section>
  );
}

const GRID = "grid grid-cols-[1fr_4.8rem_4.8rem_4.8rem] gap-1 sm:grid-cols-[1fr_7rem_7rem_7rem]";

function RateView({ rows }: { rows: RateRow[] }) {
  return (
    <>
      <div className={`${GRID} bg-muted/50 px-4 py-2 text-xs font-bold text-muted-foreground`}>
        <span>内容</span><span className="text-right">料金</span><span className="text-right text-rose-600">バック</span><span className="text-right">店落ち</span>
      </div>
      {rows.map((row) => {
        const label = row.kind === "course" ? `${row.name} ${row.minutes}分` : row.name;
        return (
          <div key={row.key} className={`${GRID} items-center border-t px-4 py-3 text-sm ${row.visible ? "" : "opacity-50"}`}>
            <span className="min-w-0">
              {label}
              {!row.visible && <span className="ml-1 text-[11px] text-muted-foreground">（HP非表示）</span>}
            </span>
            <span className="text-right tabular-nums text-muted-foreground">{yen(row.price)}</span>
            <span className="text-right font-bold tabular-nums text-rose-600">{row.back && row.back > 0 ? yen(row.back) : "なし"}</span>
            <span className="text-right tabular-nums text-muted-foreground">{yen(shopBack(row))}</span>
          </div>
        );
      })}
    </>
  );
}

function formatWhen(iso: string) {
  const date = new Date(iso);
  return date.toLocaleString("ja-JP", { timeZone: "Asia/Tokyo", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

const ACTION_LABEL = { insert: "追加", update: "変更", delete: "削除" } as const;

export default function SystemRateMaster() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const editing = searchParams.get("edit") === "1";

  const [savedRates, setSavedRates] = useState<RateRow[]>([]);
  const [rates, setRates] = useState<RateRow[]>([]);
  const [savedDiscounts, setSavedDiscounts] = useState<DiscountRow[]>([]);
  const [discounts, setDiscounts] = useState<DiscountRow[]>([]);
  const [savedPayments, setSavedPayments] = useState<PaymentRow[]>([]);
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [changes, setChanges] = useState<RateChangeRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) navigate("/auth");
  }, [authLoading, user, navigate]);

  const load = useCallback(async () => {
    setLoading(true);
    const [courses, options, nominations, discountRes, paymentRes, changeRes] = await Promise.all([
      supabase.from("back_rates").select("id, course_type, duration, customer_price, therapist_back, is_visible, description")
        .order("display_order").order("duration"),
      supabase.from("option_rates").select("id, option_name, customer_price, therapist_back, extension_minutes, is_visible")
        .order("display_order").order("option_name"),
      supabase.from("nomination_rates").select("id, nomination_type, customer_price, therapist_back")
        .order("customer_price").order("nomination_type"),
      supabase.from("discounts").select("id, name, discount_type, discount_value, is_active, display_order")
        .order("display_order").order("name"),
      supabase.from("payment_settings").select("id, payment_method, fee_percentage, payment_link, customer_guide, is_active")
        .order("payment_method"),
      (supabase.from as unknown as (table: string) => ReturnType<typeof supabase.from>)("rate_master_changes")
        .select("id, changed_at, changed_by_email, table_name, action, item_label, changes")
        .order("changed_at", { ascending: false }).limit(100),
    ]);
    const error = courses.error || options.error || nominations.error || discountRes.error || paymentRes.error;
    if (error) toast.error(`正本を読めませんでした：${error.message}`);
    const loadedRates = rowsFromRecords(
      (courses.data ?? []) as CourseRecord[],
      (options.data ?? []) as OptionRecord[],
      (nominations.data ?? []) as NominationRecord[],
    );
    const loadedDiscounts = discountRowsFromRecords((discountRes.data ?? []) as unknown as DiscountRecord[]);
    const loadedPayments = paymentRowsFromRecords((paymentRes.data ?? []) as unknown as PaymentRecord[]);
    setSavedRates(loadedRates);
    setRates(loadedRates);
    setSavedDiscounts(loadedDiscounts);
    setDiscounts(loadedDiscounts);
    setSavedPayments(loadedPayments);
    setPayments(loadedPayments);
    setChanges(((changeRes.data ?? []) as unknown as RateChangeRecord[]));
    setLoading(false);
  }, []);

  useEffect(() => {
    if (user) void load();
  }, [user, load]);

  const ratePlans = useMemo(() => planRateSave(savedRates, rates), [savedRates, rates]);
  const discountPlan = useMemo(() => planDiscountSave(savedDiscounts, discounts), [savedDiscounts, discounts]);
  const paymentPlan = useMemo(() => planPaymentSave(savedPayments, payments), [savedPayments, payments]);
  const changeCount =
    ratePlans.reduce((sum, plan) => sum + plan.inserts.length + plan.updates.length + plan.deletes.length, 0)
    + discountPlan.inserts.length + discountPlan.updates.length + discountPlan.deletes.length
    + paymentPlan.updates.length;
  const errors = useMemo(
    () => [...validateRateRows(rates), ...validateDiscountRows(discounts), ...validatePaymentRows(payments)],
    [rates, discounts, payments],
  );

  const setEditing = (on: boolean) => {
    const next = new URLSearchParams(searchParams);
    if (on) next.set("edit", "1"); else next.delete("edit");
    setSearchParams(next, { replace: false });
  };

  const resetAll = () => {
    setRates(savedRates);
    setDiscounts(savedDiscounts);
    setPayments(savedPayments);
  };

  const closeEditor = () => {
    if (changeCount > 0 && !window.confirm("保存していない変更があります。捨てて閉じますか？")) return;
    resetAll();
    setEditing(false);
  };

  // ── コース・オプション・指名 ──
  const updateRate = (key: string, patch: Partial<RateRow>) =>
    setRates((current) => current.map((row) => (row.key === key ? { ...row, ...patch } : row)));

  const addRate = (kind: RateKind) =>
    setRates((current) => {
      const row: RateRow = {
        key: `new-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        id: null, kind, name: "", minutes: kind === "course" ? 60 : null, price: 0, back: kind === "nomination" ? null : 0,
        visible: true, description: "",
      };
      const lastIndex = current.map((item) => item.kind).lastIndexOf(kind);
      const at = lastIndex === -1 ? current.length : lastIndex + 1;
      return [...current.slice(0, at), row, ...current.slice(at)];
    });

  const moveRate = (key: string, direction: -1 | 1) =>
    setRates((current) => {
      const index = current.findIndex((row) => row.key === key);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= current.length || current[target].kind !== current[index].kind) return current;
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });

  const removeRate = (row: RateRow) => {
    if (row.id && !window.confirm(`${RATE_KIND_LABEL[row.kind]}「${row.name}」を消します（保存で反映）。よろしいですか？`)) return;
    setRates((current) => current.filter((item) => item.key !== row.key));
  };

  // ── 割引 ──
  const updateDiscount = (key: string, patch: Partial<DiscountRow>) =>
    setDiscounts((current) => current.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  const addDiscount = () =>
    setDiscounts((current) => [...current, { key: `new-${Date.now()}`, id: null, name: "", type: "fixed", value: 0, active: true }]);
  const moveDiscount = (index: number, direction: -1 | 1) =>
    setDiscounts((current) => {
      const target = index + direction;
      if (target < 0 || target >= current.length) return current;
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  const removeDiscount = (row: DiscountRow) => {
    if (row.id && !window.confirm(`割引「${row.name}」を消します（保存で反映）。予約入力の選択肢から消えます。よろしいですか？`)) return;
    setDiscounts((current) => current.filter((item) => item.key !== row.key));
  };

  // ── 決済方法 ──
  const updatePayment = (id: string, patch: Partial<PaymentRow>) =>
    setPayments((current) => current.map((row) => (row.id === id ? { ...row, ...patch } : row)));

  const save = async () => {
    if (errors.length > 0) {
      toast.error(errors[0]);
      return;
    }
    setSaving(true);
    try {
      for (const plan of ratePlans) {
        const table = RATE_TABLE_NAME[plan.kind];
        for (const id of plan.deletes) {
          const { error } = await supabase.from(table).delete().eq("id", id);
          if (error) throw new Error(`${RATE_KIND_LABEL[plan.kind]}を消せませんでした：${error.message}`);
        }
        for (const { id, payload } of plan.updates) {
          const { error } = await supabase.from(table).update(payload as never).eq("id", id);
          if (error) throw new Error(`${RATE_KIND_LABEL[plan.kind]}を直せませんでした：${error.message}`);
        }
        if (plan.inserts.length > 0) {
          const { error } = await supabase.from(table).insert(plan.inserts as never);
          if (error) throw new Error(`${RATE_KIND_LABEL[plan.kind]}を足せませんでした：${error.message}`);
        }
      }
      for (const id of discountPlan.deletes) {
        const { error } = await supabase.from("discounts").delete().eq("id", id);
        if (error) throw new Error(`割引を消せませんでした：${error.message}`);
      }
      for (const { id, payload } of discountPlan.updates) {
        const { error } = await supabase.from("discounts").update(payload as never).eq("id", id);
        if (error) throw new Error(`割引を直せませんでした：${error.message}`);
      }
      if (discountPlan.inserts.length > 0) {
        const { error } = await supabase.from("discounts").insert(discountPlan.inserts as never);
        if (error) throw new Error(`割引を足せませんでした：${error.message}`);
      }
      for (const { id, payload } of paymentPlan.updates) {
        const { error } = await supabase.from("payment_settings").update(payload as never).eq("id", id);
        if (error) throw new Error(`決済方法を直せませんでした：${error.message}`);
      }
      toast.success("保存しました。変更の記録にも残りました");
      await load();
      setEditing(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "保存できませんでした");
      await load();
    } finally {
      setSaving(false);
    }
  };

  const viewRates = (kind: RateKind) => rates.filter((row) => row.kind === kind);

  return (
    <AdminPageShell mainClassName="p-3 sm:p-6">
      <div className="mx-auto max-w-4xl space-y-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-xl font-bold">料金・割引・決済（正本）</h1>
            <p className="mt-1 text-xs text-muted-foreground sm:text-sm">
              コース・オプション・指名・割引・決済方法の元になる表です。ここで直すと、マイページのバック表・HPの料金・予約入力・面談用ページ・予約案内ページに反映されます。
            </p>
          </div>
          {!editing && (
            <Button className="shrink-0" onClick={() => setEditing(true)} disabled={loading}>
              <Pencil className="mr-1.5 h-4 w-4" />編集
            </Button>
          )}
        </div>

        {loading ? (
          <div className="py-16 text-center"><Loader2 className="mx-auto h-6 w-6 animate-spin" /></div>
        ) : !editing ? (
          <>
            {RATE_KINDS.map((kind) => viewRates(kind).length > 0 && (
              <ViewSection key={kind} title={RATE_KIND_LABEL[kind]}>
                <RateView rows={viewRates(kind)} />
              </ViewSection>
            ))}

            <ViewSection title="割引">
              <div className="grid grid-cols-[1fr_7rem] gap-2 bg-muted/50 px-4 py-2 text-xs font-bold text-muted-foreground">
                <span>名前</span><span className="text-right">割引</span>
              </div>
              {discounts.length === 0 && <p className="border-t px-4 py-3 text-sm text-muted-foreground">割引はありません</p>}
              {discounts.map((row) => (
                <div key={row.key} className={`grid grid-cols-[1fr_7rem] items-center gap-2 border-t px-4 py-3 text-sm ${row.active ? "" : "opacity-50"}`}>
                  <span className="min-w-0">{row.name}{!row.active && <span className="ml-1 text-[11px] text-muted-foreground">（使わない）</span>}</span>
                  <span className="text-right font-bold tabular-nums text-rose-600">{discountValueLabel(row)}</span>
                </div>
              ))}
            </ViewSection>

            <ViewSection title="決済方法">
              <div className="grid grid-cols-[1fr_5rem_6rem] gap-2 bg-muted/50 px-4 py-2 text-xs font-bold text-muted-foreground">
                <span>名前</span><span className="text-right">手数料</span><span className="text-right">決済リンク</span>
              </div>
              {payments.map((row) => (
                <div key={row.id} className="grid grid-cols-[1fr_5rem_6rem] items-center gap-2 border-t px-4 py-3 text-sm">
                  <span className="min-w-0">{row.method}</span>
                  <span className="text-right tabular-nums">{row.fee}%</span>
                  <span className="text-right text-xs text-muted-foreground">{row.link ? "あり" : "なし"}</span>
                </div>
              ))}
              <p className="border-t px-4 py-2 text-[11px] text-muted-foreground">手数料はお客様のご負担。決済リンクとお客様への手順は予約案内ページに出ます。</p>
            </ViewSection>

            <section>
              <h2 className="mb-2 flex items-center gap-1.5 text-base font-bold"><History className="h-4 w-4" />変更の記録</h2>
              <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
                {changes.length === 0 ? (
                  <p className="px-4 py-4 text-sm text-muted-foreground">まだ記録はありません（2026年11月18日から記録しています）</p>
                ) : changes.map((change) => {
                  const lines = describeRateChange(change);
                  return (
                    <div key={change.id} className="border-t px-4 py-2.5 text-sm first:border-t-0">
                      <div className="flex flex-wrap items-baseline gap-x-2 text-xs text-muted-foreground">
                        <span className="tabular-nums">{formatWhen(change.changed_at)}</span>
                        <span>{change.changed_by_email ? change.changed_by_email.split("@")[0] : "システム"}</span>
                      </div>
                      <p className="mt-0.5">
                        <span className="mr-1 rounded bg-muted px-1.5 py-0.5 text-[11px]">{CHANGE_TABLE_LABEL[change.table_name] ?? change.table_name}</span>
                        <span className="font-medium">{change.item_label || "（名前なし）"}</span>
                        <span className={`ml-1.5 text-xs ${change.action === "delete" ? "text-red-600" : change.action === "insert" ? "text-emerald-600" : "text-amber-700"}`}>
                          {ACTION_LABEL[change.action]}
                        </span>
                      </p>
                      {lines.length > 0 && (
                        <ul className="mt-0.5 text-xs text-muted-foreground">
                          {lines.map((line) => <li key={line}>・{line}</li>)}
                        </ul>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          </>
        ) : (
          <>
            <div className="sticky top-[60px] z-10 -mx-3 flex flex-wrap items-center gap-2 border-b bg-background/95 px-3 py-2 backdrop-blur sm:-mx-6 sm:px-6">
              <span className="text-sm font-bold">編集中</span>
              <div className="ml-auto flex gap-2">
                <Button variant="outline" size="sm" onClick={closeEditor} disabled={saving}>
                  <X className="mr-1 h-4 w-4" />閉じる
                </Button>
                <Button variant="outline" size="sm" disabled={saving || changeCount === 0} onClick={resetAll}>
                  <RotateCcw className="mr-1 h-4 w-4" />元に戻す
                </Button>
                <Button size="sm" disabled={saving || changeCount === 0} onClick={() => void save()}>
                  {saving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Save className="mr-1 h-4 w-4" />}
                  保存{changeCount > 0 ? `（${changeCount}か所）` : ""}
                </Button>
              </div>
            </div>

            {errors.length > 0 && changeCount > 0 && (
              <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {errors.slice(0, 5).map((error) => <p key={error}>・{error}</p>)}
              </div>
            )}

            <div className="overflow-x-auto rounded-lg border bg-card">
              <table className="w-full min-w-[860px] border-collapse text-sm">
                <thead className="bg-muted/60 text-xs text-muted-foreground">
                  <tr>
                    <th className="px-2 py-2 text-left font-medium">名前</th>
                    <th className="px-2 py-2 text-right font-medium">時間（分）</th>
                    <th className="px-2 py-2 text-right font-medium">料金</th>
                    <th className="px-2 py-2 text-right font-medium text-rose-600">バック</th>
                    <th className="px-2 py-2 text-right font-medium">店落ち</th>
                    <th className="px-2 py-2 text-center font-medium">HP表示</th>
                    <th className="px-2 py-2 text-left font-medium">説明</th>
                    <th className="px-2 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {RATE_KINDS.map((kind) => {
                    const kindRows = rates.filter((row) => row.kind === kind);
                    return [
                      <tr key={`${kind}-head`} className="border-t bg-muted/30">
                        <td colSpan={8} className="px-2 py-1.5 text-xs font-bold">
                          {RATE_KIND_LABEL[kind]}（{kindRows.length}）
                          {kind === "option" && <span className="ml-2 font-normal text-muted-foreground">時間は延長の分（延長でなければ空）</span>}
                          {kind === "nomination" && <span className="ml-2 font-normal text-muted-foreground">バックが無いものは空（マイページでは「なし」）</span>}
                        </td>
                      </tr>,
                      ...kindRows.map((row, index) => {
                        const changed = !row.id || ratePlans.some((plan) => plan.updates.some((item) => item.id === row.id));
                        const shop = shopBack(row);
                        return (
                          <tr key={row.key} className={`border-t ${changed ? "bg-amber-50/70" : ""}`}>
                            <td className="px-2 py-1.5">
                              <Input className="h-8 min-w-[12rem] px-2" value={row.name} placeholder="名前"
                                onChange={(event) => updateRate(row.key, { name: event.target.value })} />
                            </td>
                            <td className="px-2 py-1.5 text-right">
                              {kind === "nomination"
                                ? <span className="text-muted-foreground">—</span>
                                : <NumberCell className="ml-auto w-20" value={row.minutes} placeholder={kind === "option" ? "なし" : "分"}
                                    onChange={(minutes) => updateRate(row.key, { minutes })} />}
                            </td>
                            <td className="px-2 py-1.5">
                              <NumberCell className="ml-auto w-24" value={row.price} onChange={(price) => updateRate(row.key, { price: price ?? 0 })} />
                            </td>
                            <td className="px-2 py-1.5">
                              <NumberCell className="ml-auto w-24 font-bold text-rose-600" value={row.back}
                                placeholder={kind === "course" ? "必須" : "なし"} onChange={(back) => updateRate(row.key, { back })} />
                            </td>
                            <td className={`px-2 py-1.5 text-right tabular-nums ${shop < 0 ? "text-red-600" : "text-muted-foreground"}`}>{yen(shop)}</td>
                            <td className="px-2 py-1.5 text-center">
                              {kind === "nomination"
                                ? <span className="text-muted-foreground">—</span>
                                : <Switch checked={row.visible} onCheckedChange={(visible) => updateRate(row.key, { visible })} aria-label="HPに表示" />}
                            </td>
                            <td className="px-2 py-1.5">
                              {kind === "course"
                                ? <Input className="h-8 min-w-[10rem] px-2" value={row.description} placeholder="（任意）"
                                    onChange={(event) => updateRate(row.key, { description: event.target.value })} />
                                : null}
                            </td>
                            <td className="whitespace-nowrap px-1 py-1.5 text-right">
                              {kind !== "nomination" && (
                                <>
                                  <Button type="button" variant="ghost" size="icon" className="h-7 w-7" disabled={index === 0}
                                    onClick={() => moveRate(row.key, -1)} aria-label="上へ"><ArrowUp className="h-3.5 w-3.5" /></Button>
                                  <Button type="button" variant="ghost" size="icon" className="h-7 w-7" disabled={index === kindRows.length - 1}
                                    onClick={() => moveRate(row.key, 1)} aria-label="下へ"><ArrowDown className="h-3.5 w-3.5" /></Button>
                                </>
                              )}
                              <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-red-600"
                                onClick={() => removeRate(row)} aria-label="消す"><Trash2 className="h-3.5 w-3.5" /></Button>
                            </td>
                          </tr>
                        );
                      }),
                      <tr key={`${kind}-add`} className="border-t">
                        <td colSpan={8} className="px-2 py-1.5">
                          <Button type="button" variant="ghost" size="sm" onClick={() => addRate(kind)}>
                            <Plus className="mr-1 h-4 w-4" />{RATE_KIND_LABEL[kind]}を足す
                          </Button>
                        </td>
                      </tr>,
                    ];
                  })}
                </tbody>
              </table>
            </div>

            <section className="space-y-2">
              <h2 className="text-base font-bold">割引</h2>
              <div className="space-y-2">
                {discounts.map((row, index) => {
                  const changed = !row.id || discountPlan.updates.some((item) => item.id === row.id);
                  return (
                    <div key={row.key} className={`flex flex-wrap items-center gap-2 rounded-lg border p-2 ${changed ? "bg-amber-50/70" : "bg-card"}`}>
                      <Input className="h-8 min-w-[12rem] flex-1 px-2" value={row.name} placeholder="割引の名前（エステ魂のクーポンと同じ名前に）"
                        onChange={(event) => updateDiscount(row.key, { name: event.target.value })} />
                      <select className="h-8 rounded-md border bg-background px-2 text-sm" value={row.type}
                        onChange={(event) => updateDiscount(row.key, { type: event.target.value as DiscountRow["type"] })}>
                        <option value="fixed">円引き</option>
                        <option value="percentage">％引き</option>
                      </select>
                      <NumberCell className="w-24" value={row.value} onChange={(value) => updateDiscount(row.key, { value: value ?? 0 })} />
                      <label className="flex items-center gap-1 text-xs">
                        <Switch checked={row.active} onCheckedChange={(active) => updateDiscount(row.key, { active })} aria-label="使う" />使う
                      </label>
                      <div className="ml-auto flex">
                        <Button type="button" variant="ghost" size="icon" className="h-7 w-7" disabled={index === 0}
                          onClick={() => moveDiscount(index, -1)} aria-label="上へ"><ArrowUp className="h-3.5 w-3.5" /></Button>
                        <Button type="button" variant="ghost" size="icon" className="h-7 w-7" disabled={index === discounts.length - 1}
                          onClick={() => moveDiscount(index, 1)} aria-label="下へ"><ArrowDown className="h-3.5 w-3.5" /></Button>
                        <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-red-600"
                          onClick={() => removeDiscount(row)} aria-label="消す"><Trash2 className="h-3.5 w-3.5" /></Button>
                      </div>
                    </div>
                  );
                })}
              </div>
              <Button type="button" variant="ghost" size="sm" onClick={addDiscount}><Plus className="mr-1 h-4 w-4" />割引を足す</Button>
            </section>

            <section className="space-y-2">
              <h2 className="text-base font-bold">決済方法</h2>
              {payments.map((row) => {
                const changed = paymentPlan.updates.some((item) => item.id === row.id);
                return (
                  <div key={row.id} className={`space-y-2 rounded-lg border p-3 ${changed ? "bg-amber-50/70" : "bg-card"}`}>
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="font-semibold">{row.method}</span>
                      <label className="flex items-center gap-1 text-xs">
                        手数料
                        <NumberCell decimal className="w-20" value={row.fee} onChange={(fee) => updatePayment(row.id, { fee: fee ?? 0 })} />%
                      </label>
                    </div>
                    <Input className="h-8 px-2 text-sm" inputMode="url" value={row.link} placeholder="決済リンク（予約案内ページのボタン） https://..."
                      onChange={(event) => updatePayment(row.id, { link: event.target.value })} />
                    <Textarea rows={3} className="text-sm" value={row.guide} placeholder="お客様への支払い手順（予約案内ページに出す・1行に1つ）"
                      onChange={(event) => updatePayment(row.id, { guide: event.target.value })} />
                  </div>
                );
              })}
            </section>

            <p className="text-xs text-muted-foreground">
              黄色はまだ保存していない変更です。名前を変えると、これまでの予約に入っている名前とは別のものになります（過去の予約の金額は変わりません）。保存すると「変更の記録」に残ります。
            </p>
          </>
        )}
      </div>
    </AdminPageShell>
  );
}
