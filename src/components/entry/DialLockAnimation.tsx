import { useEffect, useMemo, useState } from "react";
import { LockOpen, Pause, Play, RotateCcw } from "lucide-react";
import { codeDigits, dialMoves } from "@/lib/roomEntry";
import { usePrefersReducedMotion, useVisibleOnScreen } from "./animationHooks";

// ダイヤル式の鍵（キーボックス）を、上のダイヤルから順に回して外し、閉めるときに戻すまでをアニメーションで見せる。

const CELL = 15;
const REPEAT = 5;
const BASE = 20; // 帯の真ん中あたりを 0 にして、左右どちらに回しても帯が切れないようにする

const START_MS = 1100;
const ROLL_MS = 850;
const OPEN_MS = 2300;
const CLOSE_MS = 1100;
const RESET_MS = 1200;
const DONE_MS = 1900;

function Wheel({ position, active, instant }: { position: number; active: boolean; instant: boolean }) {
  const offset = -((BASE + position) * CELL - CELL);
  return (
    <div
      className={`relative h-[22px] overflow-hidden rounded-[4px] transition-shadow duration-200 ${active ? "shadow-[0_0_0_2px_#fbbf24,0_0_10px_2px_rgba(251,191,36,.55)]" : ""}`}
      style={{ width: CELL * 3, background: "linear-gradient(180deg,#5b5e63 0%,#1b1c1f 22%,#0d0e10 50%,#1b1c1f 78%,#5b5e63 100%)" }}
    >
      <div
        className="absolute left-0 top-0 flex h-full"
        style={{ transform: `translateX(${offset}px)`, transition: instant ? "none" : "transform 620ms cubic-bezier(.3,.1,.2,1)" }}
      >
        {Array.from({ length: REPEAT * 10 }, (_, index) => {
          const centered = index === BASE + position;
          return (
            <span
              key={index}
              className="flex h-full items-center justify-center font-mono text-[13px] font-bold"
              style={{ width: CELL, color: centered ? "#ffffff" : "#8b8e94" }}
            >
              {index % 10}
            </span>
          );
        })}
      </div>
      {/* 読み取る位置（真ん中） */}
      <div className="pointer-events-none absolute inset-y-0 left-1/2 w-[15px] -translate-x-1/2 border-x border-white/25" />
    </div>
  );
}

export function DialLockAnimation({ code, closeCode }: { code: string; closeCode?: string | null }) {
  const openDigits = useMemo(() => codeDigits(code), [code]);
  const closeDigits = useMemo(() => codeDigits(closeCode), [closeCode]);
  const hasClose = closeDigits.length > 0;
  const startDigits = useMemo(
    () => openDigits.map((_, index) => Number(closeDigits[index] ?? 0)),
    [openDigits, closeDigits],
  );
  const openMoves = useMemo(() => dialMoves(startDigits.join(""), openDigits.join("")), [startDigits, openDigits]);
  const closeMoves = useMemo(() => dialMoves(openDigits.join(""), startDigits.join("")), [openDigits, startDigits]);

  const reducedMotion = usePrefersReducedMotion();
  const [visibleRef, visible] = useVisibleOnScreen<HTMLDivElement>();
  const [playing, setPlaying] = useState(!reducedMotion);
  const [phase, setPhase] = useState(0);

  const wheels = openDigits.length;
  // 0 = 始め、1..wheels = 上から回す、open、（close、reset、done）
  const openPhase = wheels + 1;
  const closePhase = wheels + 2;
  const resetPhase = wheels + 3;
  const donePhase = wheels + 4;
  const lastPhase = hasClose ? donePhase : openPhase;

  useEffect(() => {
    if (!playing || !visible || wheels === 0) return;
    const delay = phase === 0
      ? START_MS
      : phase < openPhase
        ? ROLL_MS
        : phase === openPhase
          ? OPEN_MS
          : phase === closePhase
            ? CLOSE_MS
            : phase === resetPhase
              ? RESET_MS
              : DONE_MS;
    const timer = window.setTimeout(() => setPhase((current) => (current >= lastPhase ? 0 : current + 1)), delay);
    return () => window.clearTimeout(timer);
  }, [phase, playing, visible, wheels, openPhase, closePhase, resetPhase, lastPhase]);

  if (wheels === 0) return null;

  const positions = startDigits.map((start, index) => {
    const rolled = phase > index; // index 番目のダイヤルは phase = index+1 で回る
    let position = start + (rolled ? openMoves[index].steps : 0);
    if (phase >= resetPhase) position += closeMoves[index].steps;
    return position;
  });
  const opened = phase === openPhase;
  const rollingIndex = phase >= 1 && phase < openPhase ? phase - 1 : phase === resetPhase ? -2 : -1;
  const openText = openDigits.join("");
  const closeText = closeDigits.join("");

  const caption = phase === 0
    ? "ダイヤルを上から順に合わせます"
    : phase < openPhase
      ? `上から${phase}つ目を「${openDigits[phase - 1]}」に`
      : phase === openPhase
        ? `${openText} で外れます（解除）`
        : phase === closePhase
          ? "閉めるときは、元どおりにかけて…"
          : phase === resetPhase
            ? `ダイヤルを ${closeText} に戻します`
            : `${closeText} に戻ればOK`;

  return (
    <div ref={visibleRef} className="rounded-xl border bg-gradient-to-b from-slate-50 to-slate-100 p-3 dark:from-slate-900 dark:to-slate-950">
      <div className="flex items-start gap-3">
        {/* 鍵（壁の金具にかかっているダイヤル式の鍵） */}
        <div className="relative h-[246px] w-[120px] shrink-0" aria-hidden="true">
          <svg viewBox="0 0 120 246" className="absolute inset-0 h-full w-full">
            <defs>
              <linearGradient id="entry-shackle" x1="0" x2="1">
                <stop offset="0" stopColor="#9ca3af" />
                <stop offset=".45" stopColor="#f3f4f6" />
                <stop offset="1" stopColor="#6b7280" />
              </linearGradient>
              <linearGradient id="entry-bracket" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0" stopColor="#d1d5db" />
                <stop offset="1" stopColor="#9ca3af" />
              </linearGradient>
            </defs>
            {/* ツル（U字の金具） */}
            <path d="M44 86 V40 A16 16 0 0 1 76 40 V104" fill="none" stroke="url(#entry-shackle)" strokeWidth="7" strokeLinecap="round" />
            {/* 壁の金具 */}
            <rect x="18" y="14" width="84" height="20" rx="4" fill="url(#entry-bracket)" stroke="#6b7280" strokeWidth="1" />
            <circle cx="32" cy="24" r="4" fill="#9ca3af" stroke="#4b5563" strokeWidth="1" />
            <circle cx="88" cy="24" r="4" fill="#9ca3af" stroke="#4b5563" strokeWidth="1" />
          </svg>
          {/* 本体（合わせると下に外れる） */}
          <div
            className="absolute left-[14px] top-[84px] w-[92px] rounded-[10px] shadow-[0_10px_20px_-8px_rgba(0,0,0,.6)] ring-1 ring-black"
            style={{
              height: 142,
              background: "linear-gradient(90deg,#16171a 0%,#2b2d31 40%,#1a1b1e 100%)",
              transform: opened ? "translateY(14px) rotate(-3deg)" : "none",
              transition: "transform 450ms cubic-bezier(.3,1.4,.5,1)",
            }}
          >
            <div className="absolute inset-x-[10px] top-[8px] h-[6px] rounded-full bg-black/60" />
            <div className="absolute left-1/2 top-[22px] flex -translate-x-1/2 flex-col gap-[5px] rounded-[6px] bg-black/70 p-[5px] ring-1 ring-white/10">
              {positions.map((position, index) => (
                <Wheel
                  key={index}
                  position={position}
                  active={rollingIndex === index || rollingIndex === -2}
                  instant={phase === 0}
                />
              ))}
            </div>
          </div>
          {opened && (
            <div className="absolute left-1/2 top-[64px] -translate-x-1/2 whitespace-nowrap rounded-full bg-emerald-500 px-2 py-0.5 text-[11px] font-bold text-white shadow">
              解除
            </div>
          )}
        </div>

        {/* 合わせる番号と今の状態 */}
        <div className="min-w-0 flex-1 space-y-3 pt-1">
          <div>
            <p className="mb-1.5 text-[11px] font-semibold text-muted-foreground">上から順に合わせる</p>
            <div className="flex flex-wrap gap-1">
              {openDigits.map((digit, index) => {
                const current = rollingIndex === index;
                const done = phase > index && phase <= openPhase + (hasClose ? 1 : 0);
                return (
                  <span
                    key={index}
                    className={`flex h-8 min-w-[28px] items-center justify-center rounded-md border px-1 font-mono text-base font-bold transition-all duration-200 ${
                      current
                        ? "scale-110 border-amber-400 bg-amber-400 text-black shadow"
                        : done
                          ? "border-primary/40 bg-primary/10 text-primary"
                          : "border-border bg-background text-foreground"
                    }`}
                  >
                    {digit}
                  </span>
                );
              })}
            </div>
          </div>

          <div className={`rounded-lg px-2.5 py-2 text-sm font-semibold leading-snug ${opened ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : "bg-background text-foreground"}`}>
            {opened ? <span className="flex items-start gap-1.5"><LockOpen size={17} className="mt-0.5 shrink-0" />{caption}</span> : caption}
          </div>

          {hasClose && (
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              閉めるときは必ず <b className="font-mono text-foreground">{closeText}</b> に戻してください
            </p>
          )}
        </div>
      </div>
      <div className="mt-2.5 flex justify-end gap-1.5">
        <button
          type="button"
          onClick={() => setPlaying((value) => !value)}
          className="inline-flex items-center gap-1 whitespace-nowrap rounded-full border bg-background px-2.5 py-1 text-xs"
        >
          {playing ? <Pause size={12} /> : <Play size={12} />}{playing ? "止める" : "再生"}
        </button>
        <button
          type="button"
          onClick={() => {
            setPhase(0);
            setPlaying(true);
          }}
          className="inline-flex items-center gap-1 whitespace-nowrap rounded-full border bg-background px-2.5 py-1 text-xs"
        >
          <RotateCcw size={12} />最初から
        </button>
      </div>
    </div>
  );
}
