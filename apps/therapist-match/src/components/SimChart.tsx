import { useState } from "react";
import { manYen } from "@/lib/format";
import type { SimMonth } from "@/lib/simulator";

const W = 720;
const H = 260;
const PAD = { top: 16, right: 16, bottom: 28, left: 56 };

function niceStep(max: number) {
  const raw = max / 4;
  const pow = 10 ** Math.floor(Math.log10(raw || 1));
  const n = raw / pow;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * pow;
}

// 月ごとの売上（掲載料）と費用の2本線。重なった月が黒字化のタイミング
export function SimChart({ months, breakEvenMonth }: { months: SimMonth[]; breakEvenMonth: number | null }) {
  const [hover, setHover] = useState<number | null>(null);
  const maxValue = Math.max(...months.map((m) => Math.max(m.revenue, m.cost)));
  const step = niceStep(maxValue);
  const yMax = Math.ceil(maxValue / step) * step || 1;
  const ticks = Array.from({ length: Math.round(yMax / step) + 1 }, (_, i) => i * step);

  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const x = (i: number) => PAD.left + (months.length === 1 ? plotW / 2 : (i / (months.length - 1)) * plotW);
  const y = (v: number) => PAD.top + plotH - (v / yMax) * plotH;
  const path = (key: "revenue" | "cost") => months.map((m, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(m[key]).toFixed(1)}`).join("");
  const labelEvery = months.length > 24 ? 6 : months.length > 12 ? 3 : 1;

  const onPointer = (clientX: number, rect: DOMRect) => {
    const px = ((clientX - rect.left) / rect.width) * W;
    const i = Math.round(((px - PAD.left) / plotW) * (months.length - 1));
    setHover(Math.min(months.length - 1, Math.max(0, i)));
  };

  const h = hover !== null ? months[hover] : null;

  return (
    <div>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-0.5 w-4 rounded bg-[var(--series-1)]" /> 売上（掲載料）
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-0.5 w-4 rounded bg-[var(--series-2)]" /> 費用（広告＋コーチ＋固定費）
        </span>
      </div>
      <div className="relative mt-2">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="h-auto w-full touch-pan-y"
          role="img"
          aria-label="月ごとの売上と費用の推移"
          onPointerMove={(e) => onPointer(e.clientX, e.currentTarget.getBoundingClientRect())}
          onPointerDown={(e) => onPointer(e.clientX, e.currentTarget.getBoundingClientRect())}
          onPointerLeave={() => setHover(null)}
        >
          {ticks.map((t) => (
            <g key={t}>
              <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} stroke="hsl(var(--border))" strokeWidth={1} />
              <text x={PAD.left - 8} y={y(t)} dy="0.32em" textAnchor="end" fontSize={11} fill="hsl(var(--muted-foreground))" className="tabular">
                {manYen(t)}
              </text>
            </g>
          ))}
          {months.map((m, i) =>
            i % labelEvery === 0 || i === months.length - 1 ? (
              <text key={m.month} x={x(i)} y={H - 8} textAnchor="middle" fontSize={11} fill="hsl(var(--muted-foreground))" className="tabular">
                {m.month}月目
              </text>
            ) : null,
          )}
          {breakEvenMonth !== null && (
            <g>
              <line
                x1={x(breakEvenMonth - 1)}
                x2={x(breakEvenMonth - 1)}
                y1={PAD.top}
                y2={PAD.top + plotH}
                stroke="hsl(var(--good))"
                strokeWidth={1}
                strokeDasharray="4 4"
              />
              <text x={x(breakEvenMonth - 1) + 6} y={PAD.top + 10} fontSize={11} fill="hsl(var(--good))" fontWeight={700}>
                黒字化
              </text>
            </g>
          )}
          <path d={path("cost")} fill="none" stroke="var(--series-2)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          <path d={path("revenue")} fill="none" stroke="var(--series-1)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          {h && hover !== null && (
            <g>
              <line x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={PAD.top + plotH} stroke="hsl(var(--foreground))" strokeOpacity={0.25} strokeWidth={1} />
              <circle cx={x(hover)} cy={y(h.cost)} r={4.5} fill="var(--series-2)" stroke="hsl(var(--card))" strokeWidth={2} />
              <circle cx={x(hover)} cy={y(h.revenue)} r={4.5} fill="var(--series-1)" stroke="hsl(var(--card))" strokeWidth={2} />
            </g>
          )}
        </svg>
        {h && hover !== null && (
          <div
            className="pointer-events-none absolute top-2 z-10 w-44 rounded-lg border bg-card p-2.5 text-xs shadow-lg"
            style={{ left: `clamp(0px, calc(${(x(hover) / W) * 100}% - 88px), calc(100% - 176px))` }}
          >
            <p className="font-bold">{h.month}か月目</p>
            <p className="tabular mt-1 flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                <span className="h-0.5 w-3 rounded bg-[var(--series-1)]" /> 売上
              </span>
              <span className="font-bold">{manYen(h.revenue)}</span>
            </p>
            <p className="tabular flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                <span className="h-0.5 w-3 rounded bg-[var(--series-2)]" /> 費用
              </span>
              <span className="font-bold">{manYen(h.cost)}</span>
            </p>
            <p className="tabular mt-1 flex justify-between gap-2 border-t pt-1">
              <span className="text-muted-foreground">利益</span>
              <span className={`font-bold ${h.profit >= 0 ? "text-good" : "text-destructive"}`}>{manYen(h.profit)}</span>
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
