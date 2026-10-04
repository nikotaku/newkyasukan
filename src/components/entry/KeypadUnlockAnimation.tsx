import { useEffect, useMemo, useState } from "react";
import { Check, Lock, LockOpen, Nfc, Pause, Play, RotateCcw } from "lucide-react";
import { KEYPAD_LAYOUT, keypadPosition, keypadSequence } from "@/lib/roomEntry";
import { usePrefersReducedMotion, useVisibleOnScreen } from "./animationHooks";

// ドアのテンキー（SwitchBot キーパッド）で鍵を開ける手順を、指で押していくアニメーションで見せる。
// 並びは実物と同じ 2列×6段（1 2 / 3 4 / 5 6 / 7 8 / 9 0 / 🔒 ✓）。数字を押してから ✓ で開く。

const PAD_WIDTH = 132;
const BUTTON = 40;
const COLUMN_GAP = 12;
const ROW_GAP = 8;
const GRID_TOP = 42;
const PAD_HEIGHT = GRID_TOP + KEYPAD_LAYOUT.length * BUTTON + (KEYPAD_LAYOUT.length - 1) * ROW_GAP + 34;

const IDLE_MS = 1100;
const DIGIT_MS = 720;
const CHECK_MS = 950;
const UNLOCKED_MS = 2900;

function buttonCenter(key: string) {
  const position = keypadPosition(key);
  if (!position) return { x: PAD_WIDTH + 24, y: PAD_HEIGHT - 40 };
  const left = (PAD_WIDTH - (BUTTON * 2 + COLUMN_GAP)) / 2;
  return {
    x: left + position.col * (BUTTON + COLUMN_GAP) + BUTTON / 2,
    y: GRID_TOP + position.row * (BUTTON + ROW_GAP) + BUTTON / 2,
  };
}

function KeyFace({ value }: { value: string }) {
  if (value === "lock") return <Lock size={15} strokeWidth={1.6} />;
  if (value === "check") {
    return (
      <span className="flex h-[18px] w-[18px] items-center justify-center rounded-full border-[1.5px] border-current">
        <Check size={11} strokeWidth={2.2} />
      </span>
    );
  }
  return <span className="text-[19px] font-light leading-none">{value}</span>;
}

export function KeypadUnlockAnimation({ code }: { code: string }) {
  const sequence = useMemo(() => keypadSequence(code), [code]);
  const reducedMotion = usePrefersReducedMotion();
  const [visibleRef, visible] = useVisibleOnScreen<HTMLDivElement>();
  const [playing, setPlaying] = useState(!reducedMotion);
  // 0 = 押す前、1..n = n番目を押す、n+1 = 開いた
  const [phase, setPhase] = useState(0);
  const total = sequence.length;

  useEffect(() => {
    if (!playing || !visible || total === 0) return;
    const delay = phase === 0 ? IDLE_MS : phase <= total - 1 ? DIGIT_MS : phase === total ? CHECK_MS : UNLOCKED_MS;
    const timer = window.setTimeout(() => setPhase((current) => (current >= total + 1 ? 0 : current + 1)), delay);
    return () => window.clearTimeout(timer);
  }, [phase, playing, visible, total]);

  if (total === 0) return null;

  const unlocked = phase === total + 1;
  const activePress = phase >= 1 && phase <= total ? sequence[phase - 1] : null;
  const entering = phase >= 1 && phase <= total;
  const finger = activePress ? buttonCenter(activePress.key) : { x: PAD_WIDTH + 18, y: PAD_HEIGHT - 70 };
  const digitsEntered = Math.min(phase, total - 1);

  const caption = unlocked
    ? "鍵が開きます。ドアを開けて入室してください"
    : activePress?.key === "check"
      ? "最後に右下の ✓ を押します"
      : activePress
        ? `「${activePress.label}」を押します`
        : "テンキーにさわると光ります";

  const restart = () => {
    setPhase(0);
    setPlaying(true);
  };

  return (
    <div ref={visibleRef} className="rounded-xl border bg-gradient-to-b from-slate-50 to-slate-100 p-3 dark:from-slate-900 dark:to-slate-950">
      <style>{`
        @keyframes entry-key-press { 0% { transform: scale(1); } 45% { transform: scale(.86); } 100% { transform: scale(1); } }
        @keyframes entry-key-ripple { 0% { opacity: .75; transform: scale(.6); } 100% { opacity: 0; transform: scale(1.7); } }
        @keyframes entry-unlock-pop { 0% { opacity: 0; transform: translateY(6px) scale(.9); } 100% { opacity: 1; transform: none; } }
      `}</style>
      <div className="flex items-start gap-3">
        {/* テンキー本体 */}
        <div className="relative shrink-0" style={{ width: PAD_WIDTH + 30, height: PAD_HEIGHT }} aria-hidden="true">
          <div
            className="absolute left-0 top-0 rounded-[18px] shadow-[0_10px_24px_-8px_rgba(0,0,0,.55)] ring-1 ring-black/70"
            style={{ width: PAD_WIDTH, height: PAD_HEIGHT, background: "linear-gradient(180deg,#4a4c51 0%,#393b3f 55%,#323438 100%)" }}
          >
            {/* 上のガラス部分（光る） */}
            <div className="absolute left-[7px] right-[7px] top-[7px] h-[24px] rounded-[11px] bg-[#1f2023] ring-1 ring-black/40">
              <div
                className="absolute left-1/2 top-1/2 h-[4px] w-[34px] -translate-x-1/2 -translate-y-1/2 rounded-full transition-all duration-300"
                style={{
                  backgroundColor: unlocked ? "#34d399" : entering ? "#f8fafc" : "#4b4d52",
                  boxShadow: unlocked ? "0 0 12px 3px rgba(52,211,153,.75)" : entering ? "0 0 10px 2px rgba(248,250,252,.6)" : "none",
                }}
              />
            </div>
            {KEYPAD_LAYOUT.flat().map((key) => {
              const center = buttonCenter(key);
              const pressed = activePress?.key === key;
              return (
                <div
                  key={`${key}-${pressed ? phase : "idle"}`}
                  className="absolute flex items-center justify-center rounded-full transition-colors duration-200"
                  style={{
                    width: BUTTON,
                    height: BUTTON,
                    left: center.x - BUTTON / 2,
                    top: center.y - BUTTON / 2,
                    color: pressed ? "#ffffff" : "#e7e4dc",
                    background: pressed ? "radial-gradient(circle at 50% 40%,#6b6e75,#45474c)" : "radial-gradient(circle at 50% 35%,#3c3e43,#2c2e32)",
                    boxShadow: pressed
                      ? "0 0 0 2px rgba(255,255,255,.65), 0 0 14px 2px rgba(255,255,255,.35)"
                      : "inset 0 1px 1px rgba(255,255,255,.08), 0 1px 2px rgba(0,0,0,.5)",
                    animation: pressed ? "entry-key-press 380ms ease-out 260ms both" : undefined,
                  }}
                >
                  <KeyFace value={key} />
                </div>
              );
            })}
            {/* NFC の印（3・4 と 5・6 の間） */}
            <div
              className="absolute -translate-x-1/2 -translate-y-1/2 text-[#b9b6ae]"
              style={{ left: PAD_WIDTH / 2, top: GRID_TOP + 2 * BUTTON + ROW_GAP * 1.5 }}
            >
              <Nfc size={11} strokeWidth={1.6} />
            </div>
            <div className="absolute bottom-[10px] left-0 right-0 text-center text-[9px] font-semibold tracking-wide text-[#77797e]">SwitchBot</div>
          </div>

          {/* 指 */}
          <div
            className="pointer-events-none absolute left-0 top-0 transition-transform duration-[380ms] ease-[cubic-bezier(.4,0,.2,1)]"
            style={{ transform: `translate(${finger.x - 15}px, ${finger.y - 15}px)`, opacity: unlocked ? 0 : 1 }}
          >
            <div className="relative h-[30px] w-[30px]">
              {activePress && (
                <span
                  key={`ripple-${phase}`}
                  className="absolute inset-0 rounded-full border-2 border-white"
                  style={{ animation: "entry-key-ripple 520ms ease-out 280ms both" }}
                />
              )}
              <span className="absolute inset-0 rounded-full border-2 border-white/90 bg-amber-200/45 shadow-[0_2px_8px_rgba(0,0,0,.45)] backdrop-blur-[1px]" />
            </div>
          </div>
        </div>

        {/* 押す順番と今の状態 */}
        <div className="min-w-0 flex-1 space-y-3 pt-1">
          <div>
            <p className="mb-1.5 text-[11px] font-semibold text-muted-foreground">押す順番</p>
            <div className="flex flex-wrap gap-1">
              {sequence.map((press, index) => {
                const done = unlocked || index < digitsEntered || (press.key === "check" && phase > total);
                const current = phase - 1 === index;
                return (
                  <span
                    key={index}
                    className={`flex h-8 min-w-[28px] items-center justify-center rounded-md border px-1 font-mono text-base font-bold transition-all duration-200 ${
                      current
                        ? "scale-110 border-primary bg-primary text-primary-foreground shadow"
                        : done
                          ? "border-primary/40 bg-primary/10 text-primary"
                          : "border-border bg-background text-foreground"
                    }`}
                  >
                    {press.key === "check" ? <Check size={15} strokeWidth={3} /> : press.label}
                  </span>
                );
              })}
            </div>
          </div>

          <div className={`rounded-lg px-2.5 py-2 text-sm font-semibold leading-snug ${unlocked ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : "bg-background text-foreground"}`}>
            {unlocked ? (
              <span key={`open-${phase}`} className="flex items-start gap-1.5" style={{ animation: "entry-unlock-pop 320ms ease-out both" }}>
                <LockOpen size={17} className="mt-0.5 shrink-0" />{caption}
              </span>
            ) : (
              caption
            )}
          </div>

          <p className="text-[11px] leading-relaxed text-muted-foreground">
            出るときは左下の <Lock size={11} className="inline -mt-0.5" /> を押すと鍵がかかります
          </p>
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
        <button type="button" onClick={restart} className="inline-flex items-center gap-1 whitespace-nowrap rounded-full border bg-background px-2.5 py-1 text-xs">
          <RotateCcw size={12} />最初から
        </button>
      </div>
    </div>
  );
}
