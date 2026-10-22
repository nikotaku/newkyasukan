import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, ListChecks, Loader2, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { type ChecklistItem, newChecklistItemId } from "@/lib/trainingChecklist";

/** カリキュラム管理：講習ごとのチェック項目を足す・直す・並べ替える・消す */
export function ModuleChecklistEditor({
  moduleId,
  checklist,
  onSaved,
}: {
  moduleId: string;
  checklist: ChecklistItem[];
  onSaved: (checklist: ChecklistItem[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<ChecklistItem[]>(checklist);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) setItems(checklist);
  }, [checklist, open]);

  const add = () => {
    const label = draft.trim();
    if (!label) return;
    setItems((prev) => [...prev, { id: newChecklistItemId(), label }]);
    setDraft("");
  };

  const move = (index: number, delta: number) => {
    setItems((prev) => {
      const next = [...prev];
      const target = index + delta;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const save = async () => {
    const pending = draft.trim();
    const cleaned = [
      ...items.map((i) => ({ ...i, label: i.label.trim() })).filter((i) => i.label),
      ...(pending ? [{ id: newChecklistItemId(), label: pending }] : []),
    ];
    setSaving(true);
    const { error } = await supabase.from("training_modules" as any).update({ checklist: cleaned }).eq("id", moduleId);
    setSaving(false);
    if (error) {
      toast.error("保存に失敗しました");
      return;
    }
    toast.success("チェック項目を保存しました");
    setDraft("");
    onSaved(cleaned);
    setOpen(false);
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-2 flex w-full items-center gap-1.5 rounded-lg border border-dashed px-3 py-2 text-left text-xs text-muted-foreground hover:bg-muted/40"
      >
        <ListChecks size={14} />
        {checklist.length > 0 ? `チェック項目 ${checklist.length}個（タップで編集）` : "チェック項目を追加"}
      </button>
    );
  }

  return (
    <div className="mt-2 space-y-2 rounded-lg border bg-muted/20 p-3">
      <p className="flex items-center gap-1.5 text-xs font-semibold">
        <ListChecks size={14} />チェック項目
      </p>
      {items.length === 0 && <p className="text-xs text-muted-foreground">まだありません（無いときは「受講した」1つで数えます）</p>}
      {items.map((item, index) => (
        <div key={item.id} className="flex items-center gap-1">
          <Input
            className="h-9 flex-1 text-sm"
            value={item.label}
            onChange={(e) => setItems((prev) => prev.map((x) => (x.id === item.id ? { ...x, label: e.target.value } : x)))}
          />
          <Button type="button" size="icon" variant="ghost" className="h-8 w-8" disabled={index === 0} onClick={() => move(index, -1)} aria-label="上へ">
            <ArrowUp size={14} />
          </Button>
          <Button type="button" size="icon" variant="ghost" className="h-8 w-8" disabled={index === items.length - 1} onClick={() => move(index, 1)} aria-label="下へ">
            <ArrowDown size={14} />
          </Button>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="h-8 w-8 text-muted-foreground hover:text-destructive"
            onClick={() => setItems((prev) => prev.filter((x) => x.id !== item.id))}
            aria-label="消す"
          >
            <X size={14} />
          </Button>
        </div>
      ))}
      <div className="flex gap-1">
        <Input
          className="h-9 flex-1 text-sm"
          placeholder="項目を追加（例：身だしなみ）"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.nativeEvent.isComposing) {
              e.preventDefault();
              add();
            }
          }}
        />
        <Button type="button" size="sm" variant="outline" onClick={add}>
          <Plus size={14} />
        </Button>
      </div>
      <div className="flex gap-2 pt-1">
        <Button type="button" size="sm" onClick={() => void save()} disabled={saving}>
          {saving && <Loader2 size={14} className="mr-1.5 animate-spin" />}保存
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => { setOpen(false); setDraft(""); }}>
          やめる
        </Button>
      </div>
    </div>
  );
}
