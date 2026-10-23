import { useEffect, useRef, useState } from "react";
import { FlipHorizontal, Heart, Loader2, Move, RotateCcw, RotateCw, Undo2, Grid3x3, ScanFace, Sparkles, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Slider } from "@/components/ui/slider";
import {
  clampOffsets,
  ellipseFromDrag,
  exportEditedPhoto,
  initialPhotoEditState,
  loadEditableImage,
  renderEditedPhoto,
  type PhotoAspect,
  type PhotoEditState,
} from "@/lib/photoEditor";
import { detectSubjectMask } from "@/lib/subjectSegmentation";
import { cn } from "@/lib/utils";

const ASPECT_OPTIONS: { value: PhotoAspect; label: string }[] = [
  { value: "original", label: "元のまま" },
  { value: "1:1", label: "正方形" },
  { value: "3:4", label: "縦 3:4" },
  { value: "9:16", label: "縦 9:16" },
  { value: "4:3", label: "横 4:3" },
];

type Tool = "move" | "glow" | "heart" | "mosaic" | "background";

const OVERLAY_LABELS = { glow: "白ぼかし", heart: "ハート", mosaic: "モザイク" } as const;

/**
 * セラピスト編集の写真をその場で加工する（切り抜き・回転・反転・明るさ・顔隠し）。
 * 「保存」で加工した写真を onSave に渡す。元の写真は消さない。
 */
export function PhotoEditorDialog({
  url,
  open,
  onOpenChange,
  onSave,
}: {
  url: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (blob: Blob) => Promise<void>;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [state, setState] = useState<PhotoEditState>(initialPhotoEditState);
  const [tool, setTool] = useState<Tool>("move");
  const [stampSize, setStampSize] = useState(0.3);
  const [saving, setSaving] = useState(false);
  /** 大きさを変える・消す対象（最後に置いた・触った白ぼかし・ハート・モザイク） */
  const [selected, setSelected] = useState<number | null>(null);
  /** 自動で見分けた人のマスク（元の写真の大きさ） */
  const [subjectMask, setSubjectMask] = useState<HTMLCanvasElement | null>(null);
  const [detecting, setDetecting] = useState(false);
  const [detectError, setDetectError] = useState<string | null>(null);
  /** 今見分けている写真（同じ写真を二重に見分けない・別の写真に切り替わったら結果を捨てる） */
  const detectingFor = useRef<HTMLImageElement | null>(null);
  const drag = useRef<{
    x: number; y: number; offsetX: number; offsetY: number; startX?: number; startY?: number;
    /** 動かしている白ぼかし・ハート・モザイクの番号と、つかんだ位置のずれ */
    moveIndex?: number; grabX?: number; grabY?: number;
  } | null>(null);

  useEffect(() => {
    if (!open || !url) return;
    let active = true;
    setImage(null);
    setError(null);
    setState(initialPhotoEditState());
    setTool("move");
    setSelected(null);
    setSubjectMask(null);
    setDetectError(null);
    setDetecting(false);
    detectingFor.current = null;
    loadEditableImage(url)
      .then((img) => { if (active) setImage(img); })
      .catch((e) => { if (active) setError(e instanceof Error ? e.message : String(e)); });
    return () => { active = false; };
  }, [open, url]);

  useEffect(() => {
    if (!image || !canvasRef.current) return;
    try {
      renderEditedPhoto(canvasRef.current, image, state, 900, { showGuides: true, subjectMask, selectedOverlay: selected });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [image, state, subjectMask, selected]);

  // 背景を自動にしたら、写真の人を見分ける（1枚につき1回）
  const needsDetection = Boolean(image) && state.background.enabled && state.background.mode === "auto" && !subjectMask;
  useEffect(() => {
    if (!needsDetection || !image || detectError || detectingFor.current === image) return;
    detectingFor.current = image;
    setDetecting(true);
    detectSubjectMask(image)
      .then((mask) => { if (detectingFor.current === image) setSubjectMask(mask); })
      .catch((e) => {
        console.error("人を見分けられませんでした", e);
        if (detectingFor.current === image) setDetectError("人を自動で見分けられませんでした。「手で囲む」で残す範囲を囲んでください");
      })
      .finally(() => {
        if (detectingFor.current !== image) return;
        detectingFor.current = null;
        setDetecting(false);
      });
  }, [needsDetection, image, detectError]);

  const update = (patch: Partial<PhotoEditState>) => {
    if (!image) return;
    setState((s) => clampOffsets({ width: image.naturalWidth, height: image.naturalHeight }, { ...s, ...patch }));
  };

  const pointInFrame = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: (e.clientX - rect.left) / rect.width, y: (e.clientY - rect.top) / rect.height, rect };
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = pointInFrame(e);
    if (tool === "move") {
      drag.current = { x: e.clientX, y: e.clientY, offsetX: state.offsetX, offsetY: state.offsetY };
      return;
    }
    if (tool === "background") {
      // なぞり始めた所から、残す範囲（楕円）を囲む（なぞったら手で囲むほうに切り替える）
      drag.current = { x: e.clientX, y: e.clientY, offsetX: 0, offsetY: 0, startX: p.x, startY: p.y };
      return;
    }
    // 置いてある白ぼかし・ハート・モザイクに触れたら、それをつかんで動かす（上に重なっているものから）
    for (let i = state.overlays.length - 1; i >= 0; i--) {
      const o = state.overlays[i];
      const dx = (p.x - o.x) * p.rect.width;
      const dy = (p.y - o.y) * p.rect.height;
      if (Math.hypot(dx, dy) <= Math.max((o.size * p.rect.width) / 2, 18)) {
        drag.current = { x: e.clientX, y: e.clientY, offsetX: 0, offsetY: 0, moveIndex: i, grabX: p.x - o.x, grabY: p.y - o.y };
        setSelected(i);
        setStampSize(o.size);
        return;
      }
    }
    const index = state.overlays.length;
    const seed = Math.floor(Math.random() * 2 ** 31);
    setState((s) => ({ ...s, overlays: [...s.overlays, { kind: tool, x: p.x, y: p.y, size: stampSize, seed }] }));
    setSelected(index);
    // 白ぼかし・ハートは置いたまま指を離さずに動かせる（モザイクはなぞった跡を足す）
    drag.current = tool === "mosaic"
      ? { x: e.clientX, y: e.clientY, offsetX: 0, offsetY: 0 }
      : { x: e.clientX, y: e.clientY, offsetX: 0, offsetY: 0, moveIndex: index, grabX: 0, grabY: 0 };
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drag.current) return;
    const p = pointInFrame(e);
    if (tool === "move") {
      update({
        offsetX: drag.current.offsetX + (e.clientX - drag.current.x) / p.rect.width,
        offsetY: drag.current.offsetY + (e.clientY - drag.current.y) / p.rect.height,
      });
      return;
    }
    if (tool === "background" && drag.current.startX !== undefined && drag.current.startY !== undefined) {
      const startX = drag.current.startX;
      const startY = drag.current.startY;
      // 指が少し動いてから囲み始める（タップだけで自動の範囲を消さないように）
      if (Math.hypot(p.x - startX, p.y - startY) < 0.03) return;
      const keep = ellipseFromDrag({ x: startX, y: startY }, { x: p.x, y: p.y });
      setState((s) => ({ ...s, background: { ...s.background, enabled: true, mode: "ellipse", keep } }));
      return;
    }
    if (drag.current.moveIndex !== undefined) {
      const { moveIndex, grabX = 0, grabY = 0 } = drag.current;
      const x = Math.min(1, Math.max(0, p.x - grabX));
      const y = Math.min(1, Math.max(0, p.y - grabY));
      setState((s) => ({ ...s, overlays: s.overlays.map((o, i) => (i === moveIndex ? { ...o, x, y } : o)) }));
      return;
    }
    if (tool === "mosaic") {
      // なぞった跡もモザイクにする（少し動いたら点を足す）
      const moved = Math.hypot(e.clientX - drag.current.x, e.clientY - drag.current.y) / p.rect.width;
      if (moved > stampSize / 4) {
        drag.current = { ...drag.current, x: e.clientX, y: e.clientY };
        setState((s) => ({ ...s, overlays: [...s.overlays, { kind: "mosaic", x: p.x, y: p.y, size: stampSize }] }));
      }
    }
  };

  const onPointerUp = () => { drag.current = null; };

  const save = async () => {
    if (!image) return;
    setSaving(true);
    try {
      const blob = await exportEditedPhoto(image, state, subjectMask);
      await onSave(blob);
      onOpenChange(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const selectedOverlay = selected !== null ? state.overlays[selected] ?? null : null;

  const toolButton = (value: Tool, label: string, Icon: typeof Move) => (
    <button
      type="button"
      onClick={() => setTool(value)}
      className={cn(
        "flex min-w-[4.5rem] flex-1 items-center justify-center gap-1 rounded-md border px-2 py-1.5 text-xs",
        tool === value ? "border-primary bg-primary/10 font-semibold text-primary" : "bg-background",
      )}
    >
      <Icon size={13} />{label}
    </button>
  );

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!saving) onOpenChange(v); }}>
      <DialogContent className="max-h-[92vh] max-w-lg overflow-y-auto p-4">
        <DialogHeader>
          <DialogTitle>写真を加工</DialogTitle>
        </DialogHeader>

        {error ? (
          <p className="rounded-md bg-rose-50 p-3 text-sm text-rose-700">{error}</p>
        ) : !image ? (
          <div className="flex justify-center py-16 text-muted-foreground"><Loader2 className="h-6 w-6 animate-spin" /></div>
        ) : (
          <div className="space-y-3">
            <div className="flex justify-center rounded-md bg-muted/40 p-2">
              <canvas
                ref={canvasRef}
                className="max-h-[48vh] max-w-full touch-none rounded shadow-sm"
                style={{ cursor: tool === "move" ? "grab" : "crosshair" }}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerUp}
              />
            </div>

            <div className="flex flex-wrap gap-1">
              {toolButton("move", "動かす", Move)}
              {toolButton("glow", "白ぼかし", Sparkles)}
              {toolButton("heart", "ハート", Heart)}
              {toolButton("mosaic", "モザイク", Grid3x3)}
              {toolButton("background", "背景", ScanFace)}
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-auto px-2 text-xs"
                disabled={state.overlays.length === 0}
                onClick={() => {
                  setState((s) => ({ ...s, overlays: s.overlays.slice(0, -1) }));
                  setSelected((current) => (current !== null && current >= state.overlays.length - 1 ? null : current));
                }}
              >
                <Undo2 size={13} className="mr-1" />戻す
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground">
              {tool === "move"
                ? "写真をドラッグして位置を合わせます（ズームで寄せてから動かせます）"
                : tool === "glow"
                  ? "隠したい所（口もとなど）をタップすると、白くふんわりぼかします。置いたぼかしはドラッグで動かせます"
                  : tool === "heart"
                  ? "隠したい所をタップするとハートを置きます。置いたハートはドラッグで動かせます"
                  : tool === "mosaic"
                    ? "隠したい所をタップ・なぞるとモザイクになります。置いたモザイクはドラッグで動かせます"
                    : state.background.mode === "auto"
                      ? "写真の人を自動で見分けて、人以外をぼかします。うまくいかないときは写真をなぞって囲むと手動に切り替わります"
                      : "残したい人のまわりを、斜めになぞって囲みます（点線の外が背景になります）"}
            </p>
            {tool === "background" && (
              <div className="space-y-2 rounded-md border p-2">
                <div className="flex items-center gap-1">
                  {(["mosaic", "blur"] as const).map((effect) => (
                    <button
                      key={effect}
                      type="button"
                      onClick={() => setState((s) => ({ ...s, background: { ...s.background, enabled: true, effect } }))}
                      className={cn(
                        "flex-1 rounded-md border px-2 py-1 text-xs",
                        state.background.enabled && state.background.effect === effect
                          ? "border-primary bg-primary/10 font-semibold text-primary"
                          : "bg-background",
                      )}
                    >
                      背景を{effect === "mosaic" ? "モザイク" : "ぼかし"}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setState((s) => ({ ...s, background: { ...s.background, enabled: false } }))}
                    className={cn(
                      "rounded-md border px-2 py-1 text-xs",
                      !state.background.enabled ? "border-primary bg-primary/10 font-semibold text-primary" : "bg-background",
                    )}
                  >
                    なし
                  </button>
                </div>
                {state.background.enabled && (
                  <div className="flex items-center gap-1">
                    <span className="mr-1 text-xs">残す人</span>
                    {([
                      ["auto", "自動で見分ける"],
                      ["ellipse", "手で囲む"],
                    ] as const).map(([mode, label]) => (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => {
                          if (mode === "auto") setDetectError(null);
                          setState((s) => ({ ...s, background: { ...s.background, mode } }));
                        }}
                        className={cn(
                          "flex-1 rounded-md border px-2 py-1 text-xs",
                          state.background.mode === mode ? "border-primary bg-primary/10 font-semibold text-primary" : "bg-background",
                        )}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                )}
                {state.background.enabled && state.background.mode === "auto" && (detecting || detectError) && (
                  <p className={cn("flex items-center gap-1 text-[11px]", detectError ? "text-rose-600" : "text-muted-foreground")}>
                    {detecting && <Loader2 size={12} className="animate-spin" />}
                    {detectError ?? "写真の人を見分けています…（初めては少し時間がかかります）"}
                  </p>
                )}
                {state.background.enabled && (
                  <div>
                    <p className="mb-1 text-xs">強さ</p>
                    <Slider
                      min={1}
                      max={100}
                      step={1}
                      value={[state.background.strength]}
                      onValueChange={([v]) => setState((s) => ({ ...s, background: { ...s.background, strength: v } }))}
                    />
                  </div>
                )}
              </div>
            )}
            {(tool === "glow" || tool === "heart" || tool === "mosaic") && (
              <div>
                <div className="mb-1 flex items-center justify-between gap-2">
                  <p className="text-xs">
                    大きさ
                    {selectedOverlay && <span className="ml-1 text-muted-foreground">（点線で囲んだ{OVERLAY_LABELS[selectedOverlay.kind]}を変えます）</span>}
                  </p>
                  {selectedOverlay && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2 text-xs text-rose-600"
                      onClick={() => {
                        const index = selected;
                        setState((s) => ({ ...s, overlays: s.overlays.filter((_, i) => i !== index) }));
                        setSelected(null);
                      }}
                    >
                      <Trash2 size={12} className="mr-0.5" />消す
                    </Button>
                  )}
                </div>
                <Slider
                  min={5}
                  max={90}
                  step={1}
                  value={[Math.round((selectedOverlay?.size ?? stampSize) * 100)]}
                  onValueChange={([v]) => {
                    const size = v / 100;
                    setStampSize(size);
                    if (selected === null) return;
                    setState((s) => ({ ...s, overlays: s.overlays.map((o, i) => (i === selected ? { ...o, size } : o)) }));
                  }}
                />
              </div>
            )}

            <div>
              <p className="mb-1 text-xs font-semibold">切り抜き</p>
              <div className="flex flex-wrap gap-1">
                {ASPECT_OPTIONS.map((o) => (
                  <button
                    key={o.value}
                    type="button"
                    onClick={() => update({ aspect: o.value })}
                    className={cn(
                      "rounded-full border px-2.5 py-1 text-xs",
                      state.aspect === o.value ? "border-primary bg-primary text-primary-foreground" : "bg-background",
                    )}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-3 text-xs">
              <span>ズーム</span>
              <Slider min={100} max={300} step={1} value={[Math.round(state.zoom * 100)]} onValueChange={([v]) => update({ zoom: v / 100 })} />
              <span>明るさ</span>
              <Slider min={-60} max={60} step={1} value={[state.brightness]} onValueChange={([v]) => update({ brightness: v })} />
              <span>コントラスト</span>
              <Slider min={-60} max={60} step={1} value={[state.contrast]} onValueChange={([v]) => update({ contrast: v })} />
              <span>鮮やかさ</span>
              <Slider min={-100} max={80} step={1} value={[state.saturation]} onValueChange={([v]) => update({ saturation: v })} />
            </div>

            <div className="flex flex-wrap gap-1">
              <Button type="button" variant="outline" size="sm" className="h-8 text-xs" onClick={() => update({ rotation: ((state.rotation + 270) % 360) as PhotoEditState["rotation"] })}>
                <RotateCcw size={13} className="mr-1" />左に回す
              </Button>
              <Button type="button" variant="outline" size="sm" className="h-8 text-xs" onClick={() => update({ rotation: ((state.rotation + 90) % 360) as PhotoEditState["rotation"] })}>
                <RotateCw size={13} className="mr-1" />右に回す
              </Button>
              <Button type="button" variant="outline" size="sm" className="h-8 text-xs" onClick={() => update({ flipX: !state.flipX })}>
                <FlipHorizontal size={13} className="mr-1" />左右反転
              </Button>
              <Button type="button" variant="ghost" size="sm" className="ml-auto h-8 text-xs" onClick={() => setState(initialPhotoEditState())}>
                最初に戻す
              </Button>
            </div>
          </div>
        )}

        <div className="mt-2 flex gap-2">
          <Button type="button" variant="outline" className="flex-1" disabled={saving} onClick={() => onOpenChange(false)}>
            やめる
          </Button>
          <Button type="button" className="flex-1" disabled={!image || saving || !!error} onClick={() => void save()}>
            {saving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
            加工した写真を使う
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
