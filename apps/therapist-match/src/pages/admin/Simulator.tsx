import { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { AdminLayout } from "@/components/AdminLayout";
import { SimChart } from "@/components/SimChart";
import { Button } from "@/components/ui/button";
import { ChoiceChip } from "@/components/ui/chip";
import { manYen, percent, yen } from "@/lib/format";
import { DEFAULT_SIM_INPUT, simulate, type SimInput } from "@/lib/simulator";

type Key = Exclude<keyof SimInput, "months">;

interface Field {
  key: Key;
  label: string;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
}

const people = (v: number) => `${v}人`;
const ratio = (v: number) => percent(v);

const GROUPS: { title: string; fields: Field[] }[] = [
  {
    title: "集客（セラピスト）",
    fields: [
      { key: "adSpend", label: "月の広告費", min: 0, max: 3000000, step: 50000, format: manYen },
      { key: "cpa", label: "1登録あたりの広告費", min: 3000, max: 30000, step: 1000, format: yen },
      { key: "organic", label: "紹介・SNSからの登録（月）", min: 0, max: 60, step: 1, format: people },
    ],
  },
  {
    title: "歩留まり",
    fields: [
      { key: "interviewRate", label: "登録 → コーチ面談", min: 0.1, max: 1, step: 0.05, format: ratio },
      { key: "joinRate", label: "面談 → 入店", min: 0.05, max: 0.8, step: 0.05, format: ratio },
      { key: "retention", label: "在籍の翌月継続率", min: 0.5, max: 1, step: 0.01, format: ratio },
    ],
  },
  {
    title: "掲載店舗",
    fields: [
      { key: "storesStart", label: "はじめの店舗数", min: 0, max: 100, step: 1, format: (v) => `${v}店舗` },
      { key: "storesNewPerMonth", label: "毎月増える店舗", min: 0, max: 30, step: 1, format: (v) => `${v}店舗` },
      { key: "storeChurn", label: "店舗の月間解約率", min: 0, max: 0.3, step: 0.01, format: ratio },
      { key: "avgFee", label: "平均掲載料（月）", min: 10000, max: 150000, step: 5000, format: yen },
    ],
  },
  {
    title: "体制とコスト",
    fields: [
      { key: "coachCost", label: "コーチ1人の月額費用", min: 150000, max: 600000, step: 10000, format: manYen },
      { key: "coachCapacity", label: "コーチ1人の担当上限", min: 5, max: 60, step: 1, format: people },
      { key: "coachingMonths", label: "入店後に伴走する期間", min: 1, max: 6, step: 1, format: (v) => `${v}か月` },
      { key: "fixedCost", label: "固定費（システム・AI・事務）", min: 0, max: 2000000, step: 50000, format: manYen },
    ],
  },
];

function Stat({ label, value, note, tone }: { label: string; value: string; note?: string; tone?: "good" | "bad" }) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`tabular mt-1 text-xl font-bold ${tone === "good" ? "text-good" : tone === "bad" ? "text-destructive" : ""}`}>{value}</p>
      {note && <p className="mt-0.5 text-[11px] text-muted-foreground">{note}</p>}
    </div>
  );
}

export default function AdminSimulator() {
  const [input, setInput] = useState<SimInput>(DEFAULT_SIM_INPUT);
  const result = useMemo(() => simulate(input), [input]);
  const { last } = result;
  const set = (key: keyof SimInput, value: number) => setInput((current) => ({ ...current, [key]: value }));
  const coachShare = last.cost > 0 ? last.coachCostTotal / last.cost : 0;
  const lowValue = last.joinsPerStore < 0.5;

  return (
    <AdminLayout
      title="収支シミュレーター"
      description="売上はお店からの定額の掲載料だけで計算します。数字を動かすと、黒字になる月と必要な運転資金がその場で変わります。"
    >
      <div className="grid gap-6 xl:grid-cols-[320px_1fr]">
        <div className="flex flex-col gap-4">
          {GROUPS.map((group) => (
            <fieldset key={group.title} className="rounded-xl border bg-card p-4">
              <legend className="px-1 text-sm font-bold">{group.title}</legend>
              <div className="flex flex-col gap-3">
                {group.fields.map((f) => (
                  <div key={f.key}>
                    <div className="flex items-baseline justify-between gap-2">
                      <label htmlFor={`sim-${f.key}`} className="text-xs text-muted-foreground">
                        {f.label}
                      </label>
                      <span className="tabular text-sm font-bold">{f.format(input[f.key])}</span>
                    </div>
                    <input
                      id={`sim-${f.key}`}
                      type="range"
                      min={f.min}
                      max={f.max}
                      step={f.step}
                      value={input[f.key]}
                      onChange={(e) => set(f.key, Number(e.target.value))}
                      className="mt-1 w-full"
                    />
                  </div>
                ))}
              </div>
            </fieldset>
          ))}
          <Button variant="outline" onClick={() => setInput(DEFAULT_SIM_INPUT)}>
            はじめの数字に戻す
          </Button>
        </div>

        <div className="flex min-w-0 flex-col gap-6">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-muted-foreground">期間</span>
            {[12, 24, 36].map((m) => (
              <ChoiceChip key={m} selected={input.months === m} onClick={() => set("months", m)} className="min-h-9 px-3 text-xs">
                {m}か月
              </ChoiceChip>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
            <Stat
              label="月次で黒字になる月"
              value={result.breakEvenMonth ? `${result.breakEvenMonth}か月目` : "期間内は赤字"}
              tone={result.breakEvenMonth ? "good" : "bad"}
            />
            <Stat
              label="累積で回収できる月"
              value={result.paybackMonth ? `${result.paybackMonth}か月目` : "期間内は未回収"}
              tone={result.paybackMonth ? "good" : "bad"}
            />
            <Stat label="必要な運転資金" value={manYen(-result.worstCumulative)} note="累積赤字がいちばん深い時点" />
            <Stat
              label={`${last.month}か月目の利益`}
              value={manYen(last.profit)}
              note={`売上 ${manYen(last.revenue)}・利益率 ${last.revenue > 0 ? percent(last.profit / last.revenue) : "—"}`}
              tone={last.profit >= 0 ? "good" : "bad"}
            />
            <Stat label="1入店あたりの獲得コスト" value={yen(result.costPerJoin)} note="（広告費＋コーチ費）÷ 入店数" />
            <Stat
              label={`${last.month}か月目の規模`}
              value={`${Math.round(last.stores)}店舗・${Math.round(last.activeTherapists)}人`}
              note={`コーチ ${last.coaches}人・費用をまかなうには ${result.breakEvenStores}店舗`}
            />
          </div>

          <section className="rounded-xl border bg-card p-4">
            <h2 className="text-sm font-bold">月ごとの売上と費用</h2>
            <div className="mt-3">
              <SimChart months={result.months} breakEvenMonth={result.breakEvenMonth} />
            </div>
          </section>

          <section className="flex flex-col gap-3">
            <div className={`flex gap-3 rounded-xl border p-4 text-sm leading-relaxed ${lowValue ? "border-warn/40 bg-warn/5" : "border-good/40 bg-good/5"}`}>
              {lowValue ? <AlertTriangle className="mt-0.5 shrink-0 text-warn" size={18} /> : <CheckCircle2 className="mt-0.5 shrink-0 text-good" size={18} />}
              <p>
                {last.month}か月目の1店舗あたりの入店は<strong className="tabular"> 月{last.joinsPerStore.toFixed(2)}人 </strong>です。
                {lowValue
                  ? `お店から見ると、掲載料 ${yen(input.avgFee)} に対して入店が少なく、解約が増えやすい状態です。店舗を増やすより先に、登録数か面談→入店の率を上げる必要があります。`
                  : "お店から見て掲載料に見合う入店が出ている状態です。この水準を保てれば解約率を低く見積もれます。"}
              </p>
            </div>
            <div className="flex gap-3 rounded-xl border bg-card p-4 text-sm leading-relaxed">
              <CheckCircle2 className="mt-0.5 shrink-0 text-muted-foreground" size={18} />
              <p>
                {last.month}か月目の費用のうちコーチ費は<strong className="tabular"> {percent(coachShare)} </strong>
                です。コーチ1人が見られる人数（いまは{input.coachCapacity}人）をAIの下書き・面談記録の自動化で増やせるかが、利益を残せるかの分かれ目です。
              </p>
            </div>
          </section>

          <section>
            <h2 className="text-sm font-bold">月ごとの数字</h2>
            <div className="mt-2 overflow-x-auto rounded-xl border bg-card">
              <table className="tabular w-full min-w-[760px] text-right text-xs">
                <thead className="border-b bg-muted/50 text-muted-foreground">
                  <tr>
                    {["月", "登録", "入店", "在籍", "店舗", "コーチ", "売上", "費用", "利益", "累積"].map((h) => (
                      <th key={h} className="px-3 py-2 font-medium first:text-left">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {result.months.map((m) => (
                    <tr key={m.month}>
                      <td className="px-3 py-1.5 text-left">{m.month}か月目</td>
                      <td className="px-3 py-1.5">{Math.round(m.registrations)}</td>
                      <td className="px-3 py-1.5">{m.joins.toFixed(1)}</td>
                      <td className="px-3 py-1.5">{Math.round(m.activeTherapists)}</td>
                      <td className="px-3 py-1.5">{m.stores.toFixed(1)}</td>
                      <td className="px-3 py-1.5">{m.coaches}</td>
                      <td className="px-3 py-1.5">{manYen(m.revenue)}</td>
                      <td className="px-3 py-1.5">{manYen(m.cost)}</td>
                      <td className={`px-3 py-1.5 font-bold ${m.profit >= 0 ? "text-good" : "text-destructive"}`}>{manYen(m.profit)}</td>
                      <td className={`px-3 py-1.5 ${m.cumulativeProfit >= 0 ? "text-good" : "text-destructive"}`}>{manYen(m.cumulativeProfit)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
              入店人数やセラピストの売上に連動する報酬（成果報酬・スカウトバック）は、法律上の問題があるため売上に入れていません。詳しくは「立ち上げチェック」を見てください。
            </p>
          </section>
        </div>
      </div>
    </AdminLayout>
  );
}
