import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Pause, Play, RotateCcw } from "lucide-react";
import type { EntryRouteStep } from "@/lib/roomEntry";
import { usePrefersReducedMotion, useVisibleOnScreen } from "./animationHooks";

// 鍵の場所（入口）までの道順を、写真・動画のステップで自動再生する。
// 写真は「寄る位置」に向かってゆっくりズームし、その場所を丸で示す。動画は最後まで流れたら次へ進む。

const PHOTO_MS = 5200;
const ZOOM_DELAY_MS = 450;

function StepMedia({ step, index, playing, onVideoEnd }: {
  step: EntryRouteStep;
  index: number;
  playing: boolean;
  onVideoEnd: () => void;
}) {
  const [zoomed, setZoomed] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const focus = step.focus;
  const hasFocus = Boolean(focus);

  useEffect(() => {
    setZoomed(false);
    if (!hasFocus) return;
    const timer = window.setTimeout(() => setZoomed(true), ZOOM_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [index, hasFocus, step.image_url, focus?.x, focus?.y, focus?.zoom]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (playing) void video.play().catch(() => null);
    else video.pause();
  }, [playing, index]);

  if (step.video_url) {
    return (
      <video
        ref={videoRef}
        key={step.video_url}
        src={step.video_url}
        className="h-full w-full bg-black object-contain"
        muted
        playsInline
        autoPlay={playing}
        preload="metadata"
        onEnded={onVideoEnd}
      />
    );
  }
  if (!step.image_url) return <div className="h-full w-full bg-muted" />;

  // 寄る位置が無い写真は全体が見えるように、ある写真はその位置を中心に枠いっぱいに出してから寄る
  const origin = focus ? `${focus.x}% ${focus.y}%` : "50% 50%";
  return (
    <>
      <img
        key={step.image_url}
        src={step.image_url}
        alt={`道順 ${index + 1}`}
        className={`absolute inset-0 h-full w-full ${focus ? "object-cover" : "object-contain"}`}
        style={{
          objectPosition: origin,
          transformOrigin: origin,
          transform: zoomed && focus ? `scale(${focus.zoom})` : "scale(1)",
          transition: zoomed ? "transform 2600ms cubic-bezier(.33,0,.2,1)" : "none",
        }}
      />
      {focus && (
        <span
          className="pointer-events-none absolute h-14 w-14 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-red-500 transition-opacity duration-500"
          style={{
            left: `${focus.x}%`,
            top: `${focus.y}%`,
            opacity: zoomed ? 1 : 0,
            transitionDelay: zoomed ? "2200ms" : "0ms",
            boxShadow: "0 0 0 3px rgba(255,255,255,.7), 0 0 18px 4px rgba(239,68,68,.6)",
            animation: zoomed ? "entry-route-pulse 1.4s ease-in-out 2.4s infinite" : undefined,
          }}
        />
      )}
    </>
  );
}

export function EntryRouteSteps({ steps }: { steps: EntryRouteStep[] }) {
  const reducedMotion = usePrefersReducedMotion();
  const [visibleRef, visible] = useVisibleOnScreen<HTMLDivElement>();
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(!reducedMotion);
  const [progress, setProgress] = useState(0);
  const last = steps.length - 1;
  const step = steps[Math.min(index, last)];
  const isVideo = Boolean(step?.video_url);

  const go = useCallback((next: number) => {
    setIndex(Math.max(0, Math.min(last, next)));
    setProgress(0);
  }, [last]);

  const next = useCallback(() => {
    if (index < last) go(index + 1);
    else {
      setProgress(1);
      setPlaying(false);
    }
  }, [index, last, go]);

  // 写真は時間で進める（動画は onEnded で進める）
  useEffect(() => {
    if (!playing || !visible || isVideo || steps.length === 0) return;
    const started = Date.now() - progress * PHOTO_MS;
    const timer = window.setInterval(() => {
      const ratio = (Date.now() - started) / PHOTO_MS;
      if (ratio < 1) {
        setProgress(ratio);
        return;
      }
      window.clearInterval(timer);
      next();
    }, 100);
    return () => window.clearInterval(timer);
    // progress は再開位置として使うだけなので依存に含めない
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, visible, index, isVideo, steps.length, next]);

  if (!step) return null;
  const finished = index === last && progress >= 1;
  const togglePlay = () => {
    if (finished) {
      go(0);
      setPlaying(true);
    } else {
      setPlaying((value) => !value);
    }
  };

  return (
    <div ref={visibleRef}>
      <style>{`@keyframes entry-route-pulse { 0%,100% { transform: translate(-50%,-50%) scale(1); } 50% { transform: translate(-50%,-50%) scale(1.18); } }`}</style>
      <div className="mb-2 flex gap-1" aria-hidden="true">
        {steps.map((item, i) => (
          <div key={i} className="h-1 flex-1 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary"
              style={{ width: `${i < index ? 100 : i === index ? (item.video_url ? (finished ? 100 : 50) : Math.round(progress * 100)) : 0}%` }}
            />
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={togglePlay}
        className="relative block aspect-[4/3] w-full overflow-hidden rounded-xl bg-black text-left"
        aria-label={playing ? "一時停止" : "再生"}
      >
        <StepMedia step={step} index={index} playing={playing && visible} onVideoEnd={next} />
        <span className="absolute left-2 top-2 rounded-full bg-black/65 px-2.5 py-0.5 text-xs font-bold text-white">
          {index + 1} / {steps.length}
        </span>
        <span className="absolute right-2 top-2 rounded-full bg-black/65 p-1.5 text-white">
          {finished ? <RotateCcw size={14} /> : playing ? <Pause size={14} /> : <Play size={14} />}
        </span>
      </button>

      {step.text?.trim() && (
        <p className="mt-2.5 whitespace-pre-wrap text-sm font-medium leading-7">{step.text}</p>
      )}

      {steps.length > 1 && (
        <div className="mt-2 flex items-center justify-between">
          <button
            type="button"
            onClick={() => go(index - 1)}
            disabled={index === 0}
            className="flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs disabled:opacity-30"
          >
            <ChevronLeft size={14} />前へ
          </button>
          <button
            type="button"
            onClick={() => go(index + 1)}
            disabled={index === last}
            className="flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs disabled:opacity-30"
          >
            次へ<ChevronRight size={14} />
          </button>
        </div>
      )}
    </div>
  );
}
