import { useEffect, useState, useCallback } from "react";
import { useLocation } from "react-router-dom";
import { Plus, X, GripVertical, Clock, StickyNote, Link as LinkIcon, ListTodo, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type WidgetType = "clock" | "memo" | "link" | "todo";

interface Widget {
  id: string;
  type: WidgetType;
  data: any;
}

type RailSide = "left" | "right";

interface RailsState {
  left: Widget[];
  right: Widget[];
  hidden: boolean;
}

const STORAGE_KEY = "widget-rails-v1";

const PUBLIC_PREFIXES = [
  "/login",
  "/schedule",
  "/casts",
  "/pricing",
  "/system",
  "/access",
  "/news",
  "/booking",
  "/page/",
  "/therapist/",
  "/agreement",
];

const isAdminRoute = (pathname: string) => {
  if (pathname === "/") return false;
  if (pathname === "/system" || pathname.startsWith("/system/")) {
    // /system/* (admin) yes, but bare /system is public
    return pathname.startsWith("/system/");
  }
  return !PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/") || pathname === p);
};

const defaultState: RailsState = { left: [], right: [], hidden: false };

const loadState = (): RailsState => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState;
    return { ...defaultState, ...JSON.parse(raw) };
  } catch {
    return defaultState;
  }
};

const saveState = (s: RailsState) => {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); } catch {}
};

const newWidget = (type: WidgetType): Widget => {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  switch (type) {
    case "memo": return { id, type, data: { text: "" } };
    case "link": return { id, type, data: { label: "リンク", url: "https://" } };
    case "todo": return { id, type, data: { items: [] as { text: string; done: boolean }[] } };
    case "clock": return { id, type, data: {} };
  }
};

const ClockWidget = () => {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="text-center">
      <div className="text-2xl font-bold tabular-nums">
        {now.toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
      </div>
      <div className="text-xs text-muted-foreground mt-1">
        {now.toLocaleDateString("ja-JP", { month: "long", day: "numeric", weekday: "short" })}
      </div>
    </div>
  );
};

const MemoWidget = ({ widget, onChange }: { widget: Widget; onChange: (data: any) => void }) => (
  <textarea
    className="w-full min-h-[120px] bg-transparent text-sm resize-none outline-none placeholder:text-muted-foreground"
    placeholder="メモを入力..."
    value={widget.data.text || ""}
    onChange={(e) => onChange({ ...widget.data, text: e.target.value })}
  />
);

const LinkWidget = ({ widget, onChange }: { widget: Widget; onChange: (data: any) => void }) => {
  const [editing, setEditing] = useState(false);
  if (editing) {
    return (
      <div className="space-y-1.5">
        <input
          className="w-full bg-background text-sm px-2 py-1 rounded border border-border outline-none"
          placeholder="ラベル"
          value={widget.data.label || ""}
          onChange={(e) => onChange({ ...widget.data, label: e.target.value })}
        />
        <input
          className="w-full bg-background text-xs px-2 py-1 rounded border border-border outline-none"
          placeholder="https://"
          value={widget.data.url || ""}
          onChange={(e) => onChange({ ...widget.data, url: e.target.value })}
        />
        <Button size="sm" variant="outline" className="w-full h-7 text-xs" onClick={() => setEditing(false)}>
          完了
        </Button>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2">
      <a
        href={widget.data.url || "#"}
        target="_blank"
        rel="noopener noreferrer"
        className="flex-1 text-sm text-primary hover:underline truncate"
      >
        {widget.data.label || "リンク"}
      </a>
      <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setEditing(true)}>
        <LinkIcon className="h-3 w-3" />
      </Button>
    </div>
  );
};

const TodoWidget = ({ widget, onChange }: { widget: Widget; onChange: (data: any) => void }) => {
  const [input, setInput] = useState("");
  const items: { text: string; done: boolean }[] = widget.data.items || [];
  const add = () => {
    if (!input.trim()) return;
    onChange({ items: [...items, { text: input.trim(), done: false }] });
    setInput("");
  };
  const toggle = (i: number) => {
    const next = items.map((it, idx) => (idx === i ? { ...it, done: !it.done } : it));
    onChange({ items: next });
  };
  const remove = (i: number) => onChange({ items: items.filter((_, idx) => idx !== i) });
  return (
    <div className="space-y-1.5">
      {items.map((it, i) => (
        <div key={i} className="flex items-center gap-1.5 text-sm group">
          <input type="checkbox" checked={it.done} onChange={() => toggle(i)} className="cursor-pointer" />
          <span className={`flex-1 truncate ${it.done ? "line-through text-muted-foreground" : ""}`}>{it.text}</span>
          <button onClick={() => remove(i)} className="opacity-0 group-hover:opacity-100 transition">
            <X className="h-3 w-3" />
          </button>
        </div>
      ))}
      <div className="flex gap-1">
        <input
          className="flex-1 bg-background text-xs px-2 py-1 rounded border border-border outline-none"
          placeholder="追加..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
        />
        <Button size="icon" variant="ghost" className="h-6 w-6" onClick={add}>
          <Plus className="h-3 w-3" />
        </Button>
      </div>
    </div>
  );
};

const WidgetTitle: Record<WidgetType, string> = {
  clock: "時計",
  memo: "メモ",
  link: "リンク",
  todo: "ToDo",
};

const WidgetIcon: Record<WidgetType, React.ComponentType<{ className?: string }>> = {
  clock: Clock,
  memo: StickyNote,
  link: LinkIcon,
  todo: ListTodo,
};

interface WidgetCardProps {
  widget: Widget;
  side: RailSide;
  index: number;
  onUpdate: (data: any) => void;
  onRemove: () => void;
  onDragStart: (e: React.DragEvent) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
}

const WidgetCard = ({ widget, onUpdate, onRemove, onDragStart, onDragOver, onDrop }: WidgetCardProps) => {
  const Icon = WidgetIcon[widget.type];
  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      className="bg-card border border-border rounded-lg p-3 shadow-sm"
    >
      <div className="flex items-center justify-between mb-2 -mx-1">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <GripVertical className="h-3 w-3 cursor-grab" />
          <Icon className="h-3 w-3" />
          <span>{WidgetTitle[widget.type]}</span>
        </div>
        <button onClick={onRemove} className="text-muted-foreground hover:text-destructive">
          <X className="h-3 w-3" />
        </button>
      </div>
      {widget.type === "clock" && <ClockWidget />}
      {widget.type === "memo" && <MemoWidget widget={widget} onChange={onUpdate} />}
      {widget.type === "link" && <LinkWidget widget={widget} onChange={onUpdate} />}
      {widget.type === "todo" && <TodoWidget widget={widget} onChange={onUpdate} />}
    </div>
  );
};

const Rail = ({
  side,
  widgets,
  onAdd,
  onUpdate,
  onRemove,
  onReorder,
}: {
  side: RailSide;
  widgets: Widget[];
  onAdd: (type: WidgetType) => void;
  onUpdate: (id: string, data: any) => void;
  onRemove: (id: string) => void;
  onReorder: (from: number, to: number) => void;
}) => {
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  return (
    <div
      className={`hidden 2xl:flex fixed top-[72px] bottom-2 w-[200px] flex-col gap-2 z-30 px-1 ${
        side === "left" ? "left-[244px]" : "right-2"
      }`}
    >
      <div className="flex items-center justify-between px-1">
        <span className="text-xs font-medium text-muted-foreground">{side === "left" ? "左パネル" : "右パネル"}</span>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="icon" variant="ghost" className="h-6 w-6">
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align={side === "left" ? "start" : "end"}>
            {(["clock", "memo", "link", "todo"] as WidgetType[]).map((t) => {
              const Icon = WidgetIcon[t];
              return (
                <DropdownMenuItem key={t} onClick={() => onAdd(t)}>
                  <Icon className="h-3.5 w-3.5 mr-2" />
                  {WidgetTitle[t]}
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <div className="flex-1 overflow-y-auto space-y-2 pr-0.5">
        {widgets.length === 0 && (
          <div className="text-center text-xs text-muted-foreground py-6 border border-dashed border-border rounded-lg">
            ＋ からウィジェット追加
          </div>
        )}
        {widgets.map((w, i) => (
          <WidgetCard
            key={w.id}
            widget={w}
            side={side}
            index={i}
            onUpdate={(d) => onUpdate(w.id, d)}
            onRemove={() => onRemove(w.id)}
            onDragStart={() => setDragIndex(i)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => {
              if (dragIndex !== null && dragIndex !== i) onReorder(dragIndex, i);
              setDragIndex(null);
            }}
          />
        ))}
      </div>
    </div>
  );
};

export const WidgetRails = () => {
  const { pathname } = useLocation();
  const [state, setState] = useState<RailsState>(() => loadState());

  useEffect(() => { saveState(state); }, [state]);

  const update = useCallback((side: RailSide, fn: (arr: Widget[]) => Widget[]) => {
    setState((s) => ({ ...s, [side]: fn(s[side]) }));
  }, []);

  if (!isAdminRoute(pathname)) return null;

  return (
    <>
      <Rail
        side="left"
        widgets={state.left}
        onAdd={(t) => update("left", (a) => [...a, newWidget(t)])}
        onUpdate={(id, data) => update("left", (a) => a.map((w) => (w.id === id ? { ...w, data } : w)))}
        onRemove={(id) => update("left", (a) => a.filter((w) => w.id !== id))}
        onReorder={(from, to) =>
          update("left", (a) => {
            const next = [...a];
            const [moved] = next.splice(from, 1);
            next.splice(to, 0, moved);
            return next;
          })
        }
      />
      <Rail
        side="right"
        widgets={state.right}
        onAdd={(t) => update("right", (a) => [...a, newWidget(t)])}
        onUpdate={(id, data) => update("right", (a) => a.map((w) => (w.id === id ? { ...w, data } : w)))}
        onRemove={(id) => update("right", (a) => a.filter((w) => w.id !== id))}
        onReorder={(from, to) =>
          update("right", (a) => {
            const next = [...a];
            const [moved] = next.splice(from, 1);
            next.splice(to, 0, moved);
            return next;
          })
        }
      />
    </>
  );
};
