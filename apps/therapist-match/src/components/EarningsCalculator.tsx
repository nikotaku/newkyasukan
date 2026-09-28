import { useState } from "react";
import { monthlyEarnings } from "@/lib/earnings";
import { yen } from "@/lib/format";

function RangeRow({
  id,
  label,
  value,
  display,
  min,
  max,
  step,
  onChange,
}: {
  id: string;
  label: string;
  value: number;
  display: string;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor={id} className="text-sm">
          {label}
        </label>
        <span className="tabular text-sm font-bold">{display}</span>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-1 w-full"
      />
    </div>
  );
}

export function EarningsCalculator() {
  const [days, setDays] = useState(3);
  const [sessions, setSessions] = useState(3);
  const [back, setBack] = useState(8000);
  const [nomination, setNomination] = useState(0.3);
  const result = monthlyEarnings({ daysPerWeek: days, sessionsPerDay: sessions, backPer60: back, nominationRate: nomination, nominationFee: 2000 });

  return (
    <div className="grid gap-6 rounded-2xl border bg-card p-5 md:grid-cols-[1fr_minmax(0,300px)] md:p-6">
      <div className="flex flex-col gap-4">
        <RangeRow id="calc-days" label="週に出る日数" value={days} display={`${days}日`} min={1} max={6} step={1} onChange={setDays} />
        <RangeRow id="calc-sessions" label="1日に入る本数（60分換算）" value={sessions} display={`${sessions}本`} min={1} max={6} step={1} onChange={setSessions} />
        <RangeRow id="calc-back" label="60分1本の取り分" value={back} display={yen(back)} min={6000} max={10000} step={500} onChange={setBack} />
        <RangeRow
          id="calc-nomination"
          label="指名の割合（指名1本 +2,000円）"
          value={nomination}
          display={`${Math.round(nomination * 100)}%`}
          min={0}
          max={0.7}
          step={0.05}
          onChange={setNomination}
        />
      </div>
      <div className="flex flex-col justify-center rounded-xl bg-accent/60 p-5 text-center">
        <p className="text-xs text-muted-foreground">月収の目安</p>
        <p className="tabular mt-1 font-display text-4xl font-extrabold text-gold">{yen(result.total)}</p>
        <p className="tabular mt-2 text-xs text-muted-foreground">
          月{Math.round(result.sessions)}本 × {yen(back)}
          {result.nomination > 0 && ` ＋ 指名 ${yen(result.nomination)}`}
        </p>
        <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
          実際の収入はお店・時間帯・指名の数で変わります。指名の割合を上げるのがコーチングの目的です。
        </p>
      </div>
    </div>
  );
}
