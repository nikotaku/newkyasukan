import { useCallback, useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Pause, Play, RotateCcw } from "lucide-react";

export interface RouteGuideStep {
  image_url?: string | null;
  text?: string | null;
}

const STEP_MS = 4500;

const prefersReducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/**
 * ルームまでの道順を、写真と説明のステップで自動再生する（ストーリー形式）。
 * 写真をタップで一時停止・再開、左右の矢印で前後に移動。最後まで行ったら止まる。
 */
export function RouteGuideSteps({ steps }: { steps: RouteGuideStep[] }) {
  const usable = steps.filter((step) => step.image_url || step.text?.trim());
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(() => !prefersReducedMotion());
  const [progress, setProgress] = useState(0);
  const last = usable.length - 1;

  const go = useCallback((next: number) => {
    setIndex(Math.max(0, Math.min(last, next)));
    setProgress(0);
  }, [last]);

  useEffect(() => {
    if (!playing || usable.length === 0) return;
    const started = Date.now() - progress * STEP_MS;
    const timer = window.setInterval(() => {
      const ratio = (Date.now() - started) / STEP_MS;
      if (ratio < 1) {
        setProgress(ratio);
        return;
      }
      window.clearInterval(timer);
      if (index < last) go(index + 1);
      else {
        setProgress(1);
        setPlaying(false);
      }
    }, 100);
    return () => window.clearInterval(timer);
    // progress は再開位置として使うだけなので依存に含めない
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, index, last, go, usable.length]);

  if (usable.length === 0) return null;
  const step = usable[index];
  const finished = index === last && progress >= 1;
  const togglePlay = () => {
    if (finished) {
      go(0);
      setPlaying(true);
    } else {
      setPlaying((p) => !p);
    }
  };

  return (
    <div>
      <div className="flex gap-1 mb-2" aria-hidden="true">
        {usable.map((_, i) => (
          <div key={i} className="h-1 flex-1 rounded-full overflow-hidden" style={{ backgroundColor: "rgba(255,255,255,0.18)" }}>
            <div
              className="h-full rounded-full"
              style={{
                width: `${i < index ? 100 : i === index ? Math.round(progress * 100) : 0}%`,
                backgroundColor: "var(--pub-accent,#d4547a)",
              }}
            />
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={togglePlay}
        className="relative block w-full overflow-hidden rounded-xl text-left"
        style={{ backgroundColor: "var(--pub-card2,#2b1a28)" }}
        aria-label={playing ? "一時停止" : "再生"}
      >
        {step.image_url ? (
          <img src={step.image_url} alt={`道順 ${index + 1}`} className="w-full aspect-[4/3] object-cover" />
        ) : (
          <div className="w-full aspect-[4/3]" />
        )}
        <span className="absolute top-2 left-2 rounded-full bg-black/60 px-2.5 py-0.5 text-xs font-bold text-white">
          STEP {index + 1} / {usable.length}
        </span>
        <span className="absolute top-2 right-2 rounded-full bg-black/60 p-1.5 text-white">
          {finished ? <RotateCcw size={14} /> : playing ? <Pause size={14} /> : <Play size={14} />}
        </span>
      </button>

      {step.text?.trim() && (
        <p className="mt-3 text-sm leading-7 whitespace-pre-wrap" style={{ color: "var(--pub-text,#f7e9f0)" }}>
          {step.text}
        </p>
      )}

      <div className="mt-3 flex items-center justify-between">
        <button
          type="button"
          onClick={() => go(index - 1)}
          disabled={index === 0}
          className="flex items-center gap-1 rounded-full px-3 py-1.5 text-xs disabled:opacity-30"
          style={{ color: "var(--pub-text-mid,#dfc0cf)", border: "1px solid var(--pub-border,#4a2740)" }}
        >
          <ChevronLeft size={14} />前へ
        </button>
        <button
          type="button"
          onClick={() => go(index + 1)}
          disabled={index === last}
          className="flex items-center gap-1 rounded-full px-3 py-1.5 text-xs disabled:opacity-30"
          style={{ color: "var(--pub-text-mid,#dfc0cf)", border: "1px solid var(--pub-border,#4a2740)" }}
        >
          次へ<ChevronRight size={14} />
        </button>
      </div>
    </div>
  );
}
