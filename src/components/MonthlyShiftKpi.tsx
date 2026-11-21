import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import {
  defaults,
  summarize,
  judgment,
  percent,
  KPI_ROOMS,
  type Data,
  type Settings,
} from "@/lib/monthlyShiftKpi";
const months = Array.from(
  { length: 12 },
  (_, i) => `2027-${String(i + 1).padStart(2, "0")}`,
);
const num = (v: number | null) =>
  v === null
    ? "未集計"
    : v.toLocaleString("ja-JP", { maximumFractionDigits: 1 });
const yen = (v: number | null) => (v === null ? "未集計" : `¥${num(v)}`);
const box = "rounded-xl border bg-card p-4 space-y-3";
export function MonthlyShiftKpi({ storeId }: { storeId: string }) {
  const [month, setMonth] = useState("2027-01");
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<Settings>(defaults);
  const client = useQueryClient();
  const key = ["monthly-shift-kpi", storeId];
  const query = useQuery({
    queryKey: key,
    queryFn: async () => {
      const { data, error } = await supabase.rpc(
        "get_monthly_shift_kpi" as never,
        { p_store: storeId, p_year: 2027 } as never,
      );
      if (error) throw error;
      return data as unknown as Data;
    },
    enabled: !!storeId,
  });
  const data = query.data;
  const row = data?.settings.find((r) => r.month.slice(0, 7) === month);
  const settings = row?.settings ?? defaults();
  useEffect(() => {
    setDraft(structuredClone(row?.settings ?? defaults()));
    setEditing(false);
  }, [row, month]);
  if (query.isPending) return <p className={box}>集計中…</p>;
  if (query.isError || !data)
    return (
      <div className={box} role="alert">
        集計できませんでした。数値を0として表示していません。
        <p>{query.error?.message}</p>
        <Button onClick={() => query.refetch()}>再読込</Button>
      </div>
    );
  const today = new Date(Date.now() + 3 * 3600000).toISOString().slice(0, 10); // JST, business day changes at 06:00.
  const result = summarize(data, month, settings, today);
  const annual = months.map((m) => {
    const s =
      data.settings.find((r) => r.month.startsWith(m))?.settings ?? defaults();
    return { month: m, s, r: summarize(data, m, s, today) };
  });
  const setNumber = (field: keyof Settings, value: string) =>
    setDraft({ ...draft, [field]: Number(value) });
  const save = async (lock = false) => {
    const targets = draft.members.map((m) => m.target);
    if (
      [draft.slots, draft.treatments, draft.perShift, ...targets].some(
        (v) => !Number.isInteger(v) || v <= 0,
      ) ||
      draft.unitPrice < 0 ||
      !Number.isFinite(draft.unitPrice) ||
      draft.warning <= 0 ||
      draft.warning > 100
    ) {
      toast.error("目標値を確認してください");
      return;
    }
    if (targets.reduce((a, b) => a + b, 0) !== draft.slots) {
      toast.error("個人の出勤目標の合計を月間出勤目標に合わせてください");
      return;
    }
    if (
      lock &&
      (!draft.members.every((m) => m.id) || month >= today.slice(0, 7))
    ) {
      toast.error("4名を設定し、対象月の終了後に確定してください");
      return;
    }
    setSaving(true);
    const { error } = await supabase.rpc(
      "save_monthly_shift_kpi" as never,
      {
        p_store: storeId,
        p_month: `${month}-01`,
        p_settings: draft,
        p_revision: row?.revision ?? 0,
        p_lock: lock,
      } as never,
    );
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    await client.invalidateQueries({ queryKey: key });
    setEditing(false);
    toast.success(
      lock ? "対象者・目標を確定しました" : "この月の設定を保存しました",
    );
  };
  const status = (r: typeof result, s: Settings) =>
    !r.configured
      ? "対象者未設定"
      : r.progress === 0
        ? "開始前"
        : r.actual >= s.slots && r.done >= s.treatments && r.rate === 100
          ? "達成"
          : r.progress < 1
            ? "進行中"
            : judgment(
                Math.min(
                  percent(r.actual, s.slots),
                  percent(r.done, s.treatments),
                  r.rate ?? 0,
                ),
                100,
                s.warning,
              );
  const cards = [
    {
      title: "出勤枠",
      value: result.actual,
      target: settings.slots,
      detail: `予定 ${result.planned}枠`,
    },
    {
      title: "施術本数",
      value: result.done,
      target: settings.treatments,
      detail: `予約見込み ${result.forecast}本`,
    },
    {
      title: `1出勤${settings.perShift}本達成率`,
      value: result.rate,
      target: 100,
      detail: `${result.achieved} / ${result.actual}出勤枠`,
    },
    {
      title: "売上金額",
      value: result.sales,
      target: settings.treatments * settings.unitPrice,
      detail: `目標客単価 ${yen(settings.unitPrice)}`,
    },
  ];
  return (
    <section className="space-y-5 min-w-0" aria-label="重要KPI">
      <div className="flex flex-wrap items-center gap-3">
        <Button
          variant="outline"
          disabled={month === months[0]}
          onClick={() => setMonth(months[months.indexOf(month) - 1])}
        >
          前月
        </Button>
        <strong>{month.replace("-", "年")}月</strong>
        <Button
          variant="outline"
          disabled={month === months[11]}
          onClick={() => setMonth(months[months.indexOf(month) + 1])}
        >
          翌月
        </Button>
        <Button
          className="ml-auto"
          variant="outline"
          disabled={row?.locked}
          onClick={() => setEditing(!editing)}
        >
          {row?.locked ? "対象者・目標 確定済み" : "この月の設定"}
        </Button>
        <Button variant="ghost" onClick={() => query.refetch()}>
          更新
        </Button>
      </div>
      <p className="text-sm text-muted-foreground">
        在籍4名 ／ 月{settings.slots}出勤枠 ／ 月{settings.treatments}本 ／
        1出勤最低{settings.perShift}本。営業日進捗 {num(result.progress * 100)}
        %。
      </p>
      {!result.configured && (
        <p className="rounded-lg border border-amber-400 p-3">
          育成枠を含む対象4名を設定してください。未設定の対象者は未集計です。
        </p>
      )}
      {editing && (
        <div className={box}>
          <h2 className="font-bold">
            {month} の設定（他の月には影響しません）
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {(
              [
                ["slots", "月間出勤枠"],
                ["treatments", "月間施術本数"],
                ["perShift", "1出勤の最低本数"],
                ["unitPrice", "目標客単価（円）"],
                ["warning", "要改善の下限（%）"],
              ] as const
            ).map(([f, label]) => (
              <label className="text-sm" key={f}>
                {label}
                <Input
                  type="number"
                  min={f === "unitPrice" ? 0 : 1}
                  value={draft[f]}
                  onChange={(e) => setNumber(f, e.target.value)}
                />
              </label>
            ))}
          </div>
          {draft.members.map((m, i) => (
            <div key={i} className="grid gap-2 sm:grid-cols-3 border-t pt-3">
              <label className="text-sm">
                対象者 {i + 1}
                <select
                  className="block w-full border rounded p-2 bg-background"
                  value={m.id ?? ""}
                  onChange={(e) => {
                    const c = data.casts.find((c) => c.id === e.target.value);
                    setDraft({
                      ...draft,
                      members: draft.members.map((a, j) =>
                        j === i
                          ? {
                              ...a,
                              id: c?.id ?? null,
                              name: c?.name ?? `育成セラピスト${i + 1}`,
                            }
                          : a,
                      ),
                    });
                  }}
                >
                  <option value="">未設定</option>
                  {data.casts
                    .filter((c) => c.kind !== "w_group")
                    .map((c) => (
                      <option value={c.id} key={c.id}>
                        {c.name}
                      </option>
                    ))}
                </select>
              </label>
              <label className="text-sm">
                出勤目標（本数目安 {m.target * draft.perShift}本）
                <Input
                  type="number"
                  min={1}
                  value={m.target}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      members: draft.members.map((a, j) =>
                        j === i ? { ...a, target: Number(e.target.value) } : a,
                      ),
                    })
                  }
                />
              </label>
              <label className="text-sm">
                育成進捗
                <Input
                  value={m.training}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      members: draft.members.map((a, j) =>
                        j === i ? { ...a, training: e.target.value } : a,
                      ),
                    })
                  }
                />
              </label>
            </div>
          ))}
          <label className="block text-sm">
            休業日（日付をカンマ区切り：{month}-01）
            <Input
              value={draft.closed.join(",")}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  closed: e.target.value
                    .split(",")
                    .map((s) => s.trim())
                    .filter(Boolean),
                })
              }
            />
          </label>
          <h3>ルーム利用不可・追加確保時間</h3>
          {draft.blocks.map((b, i) => (
            <div key={i} className="flex flex-wrap gap-2">
              {(["date", "room", "start", "end"] as const).map((f) =>
                f === "room" ? (
                  <select
                    aria-label="ルーム"
                    key={f}
                    value={b.room}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        blocks: draft.blocks.map((v, j) =>
                          j === i ? { ...v, room: e.target.value } : v,
                        ),
                      })
                    }
                  >
                    {KPI_ROOMS.map((r) => (
                      <option key={r}>{r}</option>
                    ))}
                  </select>
                ) : (
                  <Input
                    className="w-36"
                    aria-label={f}
                    key={f}
                    type={f === "date" ? "date" : "time"}
                    value={b[f]}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        blocks: draft.blocks.map((v, j) =>
                          j === i ? { ...v, [f]: e.target.value } : v,
                        ),
                      })
                    }
                  />
                ),
              )}
              <Button
                variant="ghost"
                onClick={() =>
                  setDraft({
                    ...draft,
                    blocks: draft.blocks.filter((_, j) => j !== i),
                  })
                }
              >
                削除
              </Button>
            </div>
          ))}
          <Button
            variant="outline"
            onClick={() =>
              setDraft({
                ...draft,
                blocks: [
                  ...draft.blocks,
                  {
                    date: `${month}-01`,
                    room: KPI_ROOMS[0],
                    start: "11:00",
                    end: "02:00",
                  },
                ],
              })
            }
          >
            利用不可時間を追加
          </Button>
          <div className="flex flex-wrap gap-2">
            <Button disabled={saving} onClick={() => save()}>
              この月に保存
            </Button>
            <Button
              disabled={saving || month >= today.slice(0, 7)}
              variant="outline"
              onClick={() => {
                if (
                  window.confirm(
                    "この月の対象者・目標を確定します。以後変更できません。実績は既存データの訂正に追従します。",
                  )
                )
                  void save(true);
              }}
            >
              対象者・目標を確定
            </Button>
          </div>
        </div>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        {cards.map((c, i) => (
          <div className={box} key={c.title}>
            <h2 className="text-sm font-medium">{c.title}</h2>
            <div className="text-2xl font-bold break-words tabular-nums">
              {i === 3 ? yen(c.value) : num(c.value)}{" "}
              <span className="text-sm font-normal">
                / {i === 3 ? yen(c.target) : num(c.target)}
                {i === 2 ? "%" : ""}
              </span>
            </div>
            <p className="text-sm">
              {c.value === null
                ? "未集計"
                : `達成率 ${num(percent(c.value, c.target))}%`}
            </p>
            <p className="text-sm text-muted-foreground">{c.detail}</p>
            <p className="text-sm">
              {c.value === null
                ? "対象実績なし・未集計"
                : result.progress === 0
                  ? "開始前"
                  : `${result.progress < 1 && i !== 2 ? "計画進捗：" : ""}${judgment(c.value, c.target, settings.warning, i === 2 ? 1 : result.progress)}`}
            </p>
          </div>
        ))}
      </div>
      <div className={box}>
        <h2 className="font-bold">セラピスト別進捗</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm whitespace-nowrap">
            <thead>
              <tr>
                {[
                  "対象者",
                  "予定出勤",
                  "実績出勤",
                  "目標本数",
                  "実績本数",
                  "平均／出勤",
                  "売上",
                  "粗利益",
                  "本数達成率",
                ].map((t) => (
                  <th className="p-2 text-left" key={t}>
                    {t}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {result.members.map((m, i) => (
                <tr className="border-t" key={i}>
                  <td className="p-2">
                    {m.name}
                    <div className="text-muted-foreground">{m.training}</div>
                  </td>
                  {[
                    m.planned,
                    m.actual,
                    m.target * settings.perShift,
                    m.done,
                    m.actual ? m.done / m.actual : null,
                  ].map((v, j) => (
                    <td className="p-2" key={j}>
                      {m.id ? num(v) : "未集計"}
                    </td>
                  ))}
                  <td className="p-2">{yen(m.sales)}</td>
                  <td className="p-2">{yen(m.profit)}</td>
                  <td className="p-2">
                    {m.id
                      ? `${num(percent(m.done, m.target * settings.perShift))}%`
                      : "未集計"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-sm text-muted-foreground">
          出勤実績＝施術完了または精算完了がある営業日（同一人・同日を1枠）。実績未確認の過去シフト：
          {result.unverified}
          枠。売上・粗利益は対象出勤日の精算完了後に表示。粗利益＝売上−セラピスト報酬（therapist_back）、固定費控除前。
        </p>
      </div>
      <div className={box}>
        <h2 className="font-bold">3ルーム稼働分析</h2>
        <p>
          総ルーム枠 {num(result.capacity)} − 在籍使用 {num(result.resident)} −
          その他確保 {num(result.other)} ＝ 空き {num(result.remaining)}
          枠（15時間換算）
        </p>
        <p className="text-xl font-bold">
          終日受け入れ可能：{num(result.whole)}枠
        </p>
        <p className="text-sm text-muted-foreground">
          11:00〜翌2:00。交代・重複時間は統合。時間換算の端数は終日枠ではありません。Wイベント・出稼ぎの承認済みシフトと利用不可設定を含みます。
        </p>
        {result.unassigned > 0 && (
          <p role="alert">
            ルーム未割当・時間不備が{result.unassigned}
            件あります。空き枠は未集計です。
          </p>
        )}
        <p>
          Wイベント（別集計）：施術完了 {result.wDone}本 ／ 精算済み売上{" "}
          {yen(result.wSales)}
        </p>
      </div>
      <div className={box}>
        <h2 className="font-bold">2027年 年間実績</h2>
        <div className="overflow-x-auto">
          <table className="w-full whitespace-nowrap text-sm">
            <thead>
              <tr>
                {[
                  "月",
                  "出勤実績／目標",
                  "本数実績／目標",
                  "日別最低本数達成率",
                  "売上実績／目標",
                  "粗利益",
                  "終日空き枠",
                  "状況",
                ].map((t) => (
                  <th className="text-left p-2" key={t}>
                    {t}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {annual.map(({ month: m, s, r }) => (
                <tr className="border-t" key={m}>
                  <td className="p-2">
                    <button className="underline" onClick={() => setMonth(m)}>
                      {m}
                    </button>
                  </td>
                  <td className="p-2">
                    {r.actual} / {s.slots}
                  </td>
                  <td className="p-2">
                    {r.done} / {s.treatments}
                  </td>
                  <td className="p-2">
                    {num(r.rate)}
                    {r.rate === null ? "" : "%"}
                  </td>
                  <td className="p-2">
                    {yen(r.sales)} / {yen(s.treatments * s.unitPrice)}
                  </td>
                  <td className="p-2">{yen(r.profit)}</td>
                  <td className="p-2">{num(r.whole)}</td>
                  <td className="p-2">{status(r, s)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p>
          年間累計：出勤 {annual.reduce((n, a) => n + a.r.actual, 0)} /{" "}
          {annual.reduce((n, a) => n + a.s.slots, 0)}枠（
          {num(
            percent(
              annual.reduce((n, a) => n + a.r.actual, 0),
              annual.reduce((n, a) => n + a.s.slots, 0),
            ),
          )}
          %） ／ 施術 {annual.reduce((n, a) => n + a.r.done, 0)} /{" "}
          {annual.reduce((n, a) => n + a.s.treatments, 0)}本（
          {num(
            percent(
              annual.reduce((n, a) => n + a.r.done, 0),
              annual.reduce((n, a) => n + a.s.treatments, 0),
            ),
          )}
          %）
        </p>
        <p>
          年間売上（精算済み月分）：
          {yen(annual.reduce((n, a) => n + (a.r.sales ?? 0), 0))} ／ 目標{" "}
          {yen(annual.reduce((n, a) => n + a.s.treatments * a.s.unitPrice, 0))}{" "}
          ／ 達成率{" "}
          {num(
            percent(
              annual.reduce((n, a) => n + (a.r.sales ?? 0), 0),
              annual.reduce((n, a) => n + a.s.treatments * a.s.unitPrice, 0),
            ),
          )}
          %。粗利益（精算済み月分）：
          {yen(
            annual.reduce((n, a) => n + (a.r.profit ?? 0), 0),
          )}。未集計月 {annual.filter((a) => a.r.sales === null).length}か月。
        </p>
        <p className="text-sm text-muted-foreground">
          実績は既存データから毎回集計します。月ごとの対象者・目標を保存し、確定後の対象変更を防ぎます。
        </p>
      </div>
    </section>
  );
}
