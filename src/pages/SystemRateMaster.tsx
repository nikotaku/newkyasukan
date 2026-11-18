// 料金・バック表（正本）。コース・オプション・指名の料金とセラピストのバックを1枚の表で直す。
// ここで保存した値が、セラピストのマイページの「バック表」・HPの料金・予約入力・面談用ページにそのまま出る。
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowDown, ArrowUp, Loader2, Plus, RotateCcw, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { AdminPageShell } from "@/components/AdminPageShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import {
  planRateSave,
  RATE_KIND_LABEL,
  RATE_KINDS,
  RATE_TABLE_NAME,
  rowsFromRecords,
  shopBack,
  validateRateRows,
  type CourseRecord,
  type NominationRecord,
  type OptionRecord,
  type RateKind,
  type RateRow,
} from "@/lib/rateMaster";

const yen = (value: number) => `¥${value.toLocaleString()}`;

/** 数字の欄（空なら null） */
function NumberCell({ value, onChange, placeholder, className = "w-24" }: {
  value: number | null;
  onChange: (value: number | null) => void;
  placeholder?: string;
  className?: string;
}) {
  return (
    <Input
      inputMode="numeric"
      className={`h-8 px-2 text-right tabular-nums ${className}`}
      value={value === null ? "" : String(value)}
      placeholder={placeholder}
      onChange={(event) => {
        const digits = event.target.value.replace(/[^\d]/g, "");
        onChange(digits === "" ? null : Number(digits));
      }}
    />
  );
}

export default function SystemRateMaster() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [saved, setSaved] = useState<RateRow[]>([]);
  const [rows, setRows] = useState<RateRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) navigate("/auth");
  }, [authLoading, user, navigate]);

  const load = useCallback(async () => {
    setLoading(true);
    const [courses, options, nominations] = await Promise.all([
      supabase.from("back_rates").select("id, course_type, duration, customer_price, therapist_back, is_visible, description")
        .order("display_order").order("duration"),
      supabase.from("option_rates").select("id, option_name, customer_price, therapist_back, extension_minutes, is_visible")
        .order("display_order").order("option_name"),
      supabase.from("nomination_rates").select("id, nomination_type, customer_price, therapist_back")
        .order("customer_price").order("nomination_type"),
    ]);
    const error = courses.error || options.error || nominations.error;
    if (error) toast.error(`料金表を読めませんでした：${error.message}`);
    const loaded = rowsFromRecords(
      (courses.data ?? []) as CourseRecord[],
      (options.data ?? []) as OptionRecord[],
      (nominations.data ?? []) as NominationRecord[],
    );
    setSaved(loaded);
    setRows(loaded);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (user) void load();
  }, [user, load]);

  const plans = useMemo(() => planRateSave(saved, rows), [saved, rows]);
  const changeCount = plans.reduce((sum, plan) => sum + plan.inserts.length + plan.updates.length + plan.deletes.length, 0);
  const errors = useMemo(() => validateRateRows(rows), [rows]);

  const update = (key: string, patch: Partial<RateRow>) =>
    setRows((current) => current.map((row) => (row.key === key ? { ...row, ...patch } : row)));

  const addRow = (kind: RateKind) =>
    setRows((current) => {
      const row: RateRow = {
        key: `new-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        id: null, kind, name: "", minutes: kind === "course" ? 60 : null, price: 0, back: kind === "nomination" ? null : 0,
        visible: true, description: "",
      };
      const lastIndex = current.map((item) => item.kind).lastIndexOf(kind);
      const at = lastIndex === -1 ? current.length : lastIndex + 1;
      return [...current.slice(0, at), row, ...current.slice(at)];
    });

  const move = (key: string, direction: -1 | 1) =>
    setRows((current) => {
      const index = current.findIndex((row) => row.key === key);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= current.length || current[target].kind !== current[index].kind) return current;
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });

  const remove = (row: RateRow) => {
    if (row.id && !window.confirm(`${RATE_KIND_LABEL[row.kind]}「${row.name}」を消します（保存で反映）。よろしいですか？`)) return;
    setRows((current) => current.filter((item) => item.key !== row.key));
  };

  const save = async () => {
    if (errors.length > 0) {
      toast.error(errors[0]);
      return;
    }
    setSaving(true);
    try {
      for (const plan of plans) {
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
      toast.success("保存しました。マイページのバック表にも反映されています");
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "保存できませんでした");
      await load();
    } finally {
      setSaving(false);
    }
  };

  return (
    <AdminPageShell mainClassName="p-3 sm:p-6">
      <div className="mx-auto max-w-6xl space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold">料金・バック表（正本）</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              コース・オプション・指名の料金とバックの元になる表です。ここで保存すると、セラピストのマイページの「バック表」・HPの料金・予約入力・面談用ページに反映されます。店落ちは「料金−バック」で自動です。
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" disabled={saving || changeCount === 0} onClick={() => setRows(saved)}>
              <RotateCcw className="mr-1.5 h-4 w-4" />元に戻す
            </Button>
            <Button disabled={saving || changeCount === 0} onClick={() => void save()}>
              {saving ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Save className="mr-1.5 h-4 w-4" />}
              保存{changeCount > 0 ? `（${changeCount}か所）` : ""}
            </Button>
          </div>
        </div>

        {errors.length > 0 && changeCount > 0 && (
          <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {errors.slice(0, 5).map((error) => <p key={error}>・{error}</p>)}
          </div>
        )}

        {loading ? (
          <div className="py-16 text-center"><Loader2 className="mx-auto h-6 w-6 animate-spin" /></div>
        ) : (
          <div className="overflow-x-auto rounded-lg border bg-card">
            <table className="w-full min-w-[860px] border-collapse text-sm">
              <thead className="sticky top-0 bg-muted/60 text-xs text-muted-foreground">
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
                  const kindRows = rows.filter((row) => row.kind === kind);
                  return [
                    <tr key={`${kind}-head`} className="border-t bg-muted/30">
                      <td colSpan={8} className="px-2 py-1.5 text-xs font-bold">
                        {RATE_KIND_LABEL[kind]}（{kindRows.length}）
                        {kind === "option" && <span className="ml-2 font-normal text-muted-foreground">時間は延長の分（延長でなければ空）</span>}
                        {kind === "nomination" && <span className="ml-2 font-normal text-muted-foreground">バックが無いものは空（マイページでは「なし」）</span>}
                      </td>
                    </tr>,
                    ...kindRows.map((row, index) => {
                      const changed = !row.id || plans.some((plan) => plan.updates.some((item) => item.id === row.id));
                      const shop = shopBack(row);
                      return (
                        <tr key={row.key} className={`border-t ${changed ? "bg-amber-50/70" : ""}`}>
                          <td className="px-2 py-1.5">
                            <Input className="h-8 min-w-[12rem] px-2" value={row.name} placeholder="名前"
                              onChange={(event) => update(row.key, { name: event.target.value })} />
                          </td>
                          <td className="px-2 py-1.5 text-right">
                            {kind === "nomination"
                              ? <span className="text-muted-foreground">—</span>
                              : <NumberCell className="ml-auto w-20" value={row.minutes} placeholder={kind === "option" ? "なし" : "分"}
                                  onChange={(minutes) => update(row.key, { minutes })} />}
                          </td>
                          <td className="px-2 py-1.5">
                            <NumberCell className="ml-auto w-24" value={row.price} onChange={(price) => update(row.key, { price: price ?? 0 })} />
                          </td>
                          <td className="px-2 py-1.5">
                            <NumberCell className="ml-auto w-24 font-bold text-rose-600" value={row.back}
                              placeholder={kind === "course" ? "必須" : "なし"} onChange={(back) => update(row.key, { back })} />
                          </td>
                          <td className={`px-2 py-1.5 text-right tabular-nums ${shop < 0 ? "text-red-600" : "text-muted-foreground"}`}>{yen(shop)}</td>
                          <td className="px-2 py-1.5 text-center">
                            {kind === "nomination"
                              ? <span className="text-muted-foreground">—</span>
                              : <Switch checked={row.visible} onCheckedChange={(visible) => update(row.key, { visible })} aria-label="HPに表示" />}
                          </td>
                          <td className="px-2 py-1.5">
                            {kind === "course"
                              ? <Input className="h-8 min-w-[10rem] px-2" value={row.description} placeholder="（任意）"
                                  onChange={(event) => update(row.key, { description: event.target.value })} />
                              : null}
                          </td>
                          <td className="whitespace-nowrap px-1 py-1.5 text-right">
                            {kind !== "nomination" && (
                              <>
                                <Button type="button" variant="ghost" size="icon" className="h-7 w-7" disabled={index === 0}
                                  onClick={() => move(row.key, -1)} aria-label="上へ"><ArrowUp className="h-3.5 w-3.5" /></Button>
                                <Button type="button" variant="ghost" size="icon" className="h-7 w-7" disabled={index === kindRows.length - 1}
                                  onClick={() => move(row.key, 1)} aria-label="下へ"><ArrowDown className="h-3.5 w-3.5" /></Button>
                              </>
                            )}
                            <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-red-600"
                              onClick={() => remove(row)} aria-label="消す"><Trash2 className="h-3.5 w-3.5" /></Button>
                          </td>
                        </tr>
                      );
                    }),
                    <tr key={`${kind}-add`} className="border-t">
                      <td colSpan={8} className="px-2 py-1.5">
                        <Button type="button" variant="ghost" size="sm" onClick={() => addRow(kind)}>
                          <Plus className="mr-1 h-4 w-4" />{RATE_KIND_LABEL[kind]}を足す
                        </Button>
                      </td>
                    </tr>,
                  ];
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-xs text-muted-foreground">
          黄色の行はまだ保存していない変更です。名前を変えると、これまでの予約に入っている名前とは別のものになります（過去の予約の金額は変わりません）。
        </p>
      </div>
    </AdminPageShell>
  );
}
