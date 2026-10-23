import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Dispatch, PointerEvent as ReactPointerEvent, SetStateAction } from "react";
import { Check, GripVertical, Loader2, Pencil, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ModuleChecklistEditor } from "@/components/education/ModuleChecklistEditor";
import { useAdminStore } from "@/hooks/useAdminStore";
import { supabase } from "@/integrations/supabase/client";
import {
  type ChecklistItem,
  TRAINING_CATEGORIES_KEY,
  moveInList,
  moveModule,
  newChecklistItemId,
  orderedCategories,
  parseCategoryList,
  renumberByCategories,
} from "@/lib/trainingChecklist";

export interface CurriculumModule {
  id: string;
  category: string;
  title: string;
  description: string | null;
  display_order: number;
  is_active: boolean;
  checklist: ChecklistItem[];
}

type DragState =
  | { kind: "module"; id: string; label: string; x: number; y: number }
  | { kind: "category"; name: string; label: string; x: number; y: number };

type DragStart = { kind: "module"; id: string; label: string } | { kind: "category"; name: string; label: string };

type DropTarget =
  | { kind: "module"; category: string; beforeId: string | null }
  | { kind: "category"; index: number };

/**
 * カリキュラム管理：カテゴリを先に作り、講習のカテゴリはプルダウンで選ぶ。
 * 講習・カテゴリは左のつまみ（⋮⋮）を押したまま動かして並べ替え・別のカテゴリへ移動（スマホの指でも動く）。
 * カテゴリの一覧と並び順は site_content の training_categories。
 */
export function CurriculumManager({
  modules,
  setModules,
  onReload,
}: {
  modules: CurriculumModule[];
  setModules: Dispatch<SetStateAction<CurriculumModule[]>>;
  onReload: () => void;
}) {
  const { storeId } = useAdminStore();
  const [savedCategories, setSavedCategories] = useState<string[]>([]);
  const [newCategory, setNewCategory] = useState("");
  const [newModule, setNewModule] = useState({ category: "", title: "", description: "", items: "" });
  const [addingModule, setAddingModule] = useState(false);
  const [renamingCategory, setRenamingCategory] = useState<{ from: string; to: string } | null>(null);
  const [editingModule, setEditingModule] = useState<{ id: string; category: string; title: string; description: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [drop, setDrop] = useState<DropTarget | null>(null);
  const dropRef = useRef<DropTarget | null>(null);

  const categories = useMemo(() => orderedCategories(savedCategories, modules), [savedCategories, modules]);

  const grouped = useMemo(() => {
    const sorted = [...modules].sort((a, b) => a.display_order - b.display_order);
    return categories.map((category) => ({ category, mods: sorted.filter((m) => m.category === category) }));
  }, [categories, modules]);

  useEffect(() => {
    if (!storeId) return;
    void supabase.from("site_content").select("value").eq("store_id", storeId).eq("key", TRAINING_CATEGORIES_KEY).maybeSingle()
      .then(({ data }) => setSavedCategories(parseCategoryList(data?.value ?? null)));
  }, [storeId]);

  // 新規追加のカテゴリは、まだ選んでいなければ先頭
  useEffect(() => {
    if (!newModule.category && categories[0]) setNewModule((f) => ({ ...f, category: categories[0] }));
  }, [categories, newModule.category]);

  const saveCategories = async (list: string[]) => {
    setSavedCategories(list);
    if (!storeId) return false;
    const { error } = await supabase.from("site_content").upsert(
      { store_id: storeId, key: TRAINING_CATEGORIES_KEY, value: JSON.stringify(list), updated_at: new Date().toISOString() },
      { onConflict: "store_id,key" },
    );
    if (error) { toast.error(`カテゴリを保存できませんでした: ${error.message}`); return false; }
    return true;
  };

  const saveOrder = async (changed: { id: string; category: string; display_order: number }[]) => {
    if (changed.length === 0) return;
    const results = await Promise.all(changed.map((c) =>
      supabase.from("training_modules" as never).update({ category: c.category, display_order: c.display_order } as never).eq("id", c.id)));
    if (results.some((r) => r.error)) {
      toast.error("並び順を保存できませんでした");
      onReload();
    }
  };

  const addCategory = async () => {
    const name = newCategory.trim();
    if (!name) return;
    if (categories.includes(name)) { toast.error("同じ名前のカテゴリがあります"); return; }
    if (await saveCategories([...categories, name])) {
      setNewCategory("");
      setNewModule((f) => ({ ...f, category: name }));
      toast.success(`カテゴリ「${name}」を作りました`);
    }
  };

  const removeCategory = async (name: string) => {
    if (modules.some((m) => m.category === name)) { toast.error("講習が入っているカテゴリは消せません"); return; }
    if (await saveCategories(categories.filter((c) => c !== name))) toast.success("カテゴリを消しました");
  };

  // カテゴリの名前を変える（そのカテゴリの講習をまとめて付け替える）
  const renameCategory = async () => {
    if (!renamingCategory) return;
    const to = renamingCategory.to.trim();
    if (!to) { toast.error("カテゴリ名を入力してください"); return; }
    if (to === renamingCategory.from) { setRenamingCategory(null); return; }
    if (categories.includes(to)) { toast.error("同じ名前のカテゴリがあります（講習はドラッグで移せます）"); return; }
    const ids = modules.filter((m) => m.category === renamingCategory.from).map((m) => m.id);
    setSaving(true);
    const { error } = ids.length
      ? await supabase.from("training_modules" as never).update({ category: to } as never).in("id", ids)
      : { error: null };
    if (!error) await saveCategories(categories.map((c) => (c === renamingCategory.from ? to : c)));
    setSaving(false);
    if (error) { toast.error("保存に失敗しました"); return; }
    setModules((prev) => prev.map((m) => (ids.includes(m.id) ? { ...m, category: to } : m)));
    setRenamingCategory(null);
    toast.success("カテゴリ名を変えました");
  };

  const addModule = async () => {
    if (!newModule.category) { toast.error("カテゴリを選んでください（先にカテゴリを作ります）"); return; }
    if (!newModule.title.trim()) { toast.error("項目名を入力してください"); return; }
    setAddingModule(true);
    // 選んだカテゴリの最後に入れる
    const inCategory = modules.filter((m) => m.category === newModule.category);
    const display_order = inCategory.length
      ? Math.max(...inCategory.map((m) => m.display_order)) + 1
      : Math.max(0, ...modules.map((m) => m.display_order)) + 10;
    const checklist = newModule.items.split("\n").map((l) => l.trim()).filter(Boolean)
      .map((label) => ({ id: newChecklistItemId(), label }));
    const { data, error } = await supabase.from("training_modules" as never).insert([{
      category: newModule.category,
      title: newModule.title.trim(),
      description: newModule.description.trim() || null,
      display_order,
      checklist,
    }] as never).select("*").single();
    setAddingModule(false);
    if (error || !data) { toast.error("追加に失敗しました"); return; }
    const created = data as unknown as CurriculumModule;
    const { modules: next, changed } = renumberByCategories([...modules, { ...created, checklist }], categories);
    setModules(next);
    void saveOrder(changed);
    toast.success("カリキュラム項目を追加しました");
    setNewModule((f) => ({ ...f, title: "", description: "", items: "" }));
  };

  // 講習のカテゴリ・名前・説明を直す（カテゴリを変えたらそのカテゴリの最後へ）
  const saveModuleEdit = async () => {
    if (!editingModule) return;
    const title = editingModule.title.trim();
    if (!title) { toast.error("項目名を入力してください"); return; }
    const description = editingModule.description.trim() || null;
    const current = modules.find((m) => m.id === editingModule.id);
    setSaving(true);
    const { error } = await supabase.from("training_modules" as never)
      .update({ title, description } as never).eq("id", editingModule.id);
    setSaving(false);
    if (error) { toast.error("保存に失敗しました"); return; }
    let next = modules.map((m) => (m.id === editingModule.id ? { ...m, title, description } : m));
    if (current && current.category !== editingModule.category) {
      const moved = moveModule(next, categories, editingModule.id, editingModule.category, null);
      next = moved.modules;
      void saveOrder(moved.changed);
    }
    setModules(next);
    setEditingModule(null);
    toast.success("保存しました");
  };

  const deleteModule = async (id: string) => {
    if (!confirm("この項目を削除しますか？受講記録も削除されます。")) return;
    const { error } = await supabase.from("training_modules" as never).update({ is_active: false } as never).eq("id", id);
    if (error) { toast.error("削除に失敗しました"); return; }
    toast.success("削除しました");
    onReload();
  };

  // ── ドラッグ（指でもマウスでも。つまみを押したまま動かす） ──
  const findTarget = useCallback((state: DragState, x: number, y: number): DropTarget | null => {
    const el = document.elementFromPoint(x, y) as HTMLElement | null;
    if (!el) return null;
    if (state.kind === "category") {
      const section = el.closest<HTMLElement>("[data-category-index]");
      if (!section) return null;
      const index = Number(section.dataset.categoryIndex);
      const rect = section.getBoundingClientRect();
      return { kind: "category", index: y < rect.top + Math.min(rect.height / 2, 40) ? index : index + 1 };
    }
    const card = el.closest<HTMLElement>("[data-module-id]");
    if (card) {
      const category = card.dataset.category ?? "";
      const rect = card.getBoundingClientRect();
      if (y < rect.top + rect.height / 2) return { kind: "module", category, beforeId: card.dataset.moduleId ?? null };
      const list = grouped.find((g) => g.category === category)?.mods ?? [];
      const i = list.findIndex((m) => m.id === card.dataset.moduleId);
      const after = list.slice(i + 1).find((m) => m.id !== state.id);
      return { kind: "module", category, beforeId: after?.id ?? null };
    }
    const section = el.closest<HTMLElement>("[data-category-index]");
    if (section) return { kind: "module", category: section.dataset.category ?? "", beforeId: null };
    return null;
  }, [grouped]);

  const finishDrag = useCallback((state: DragState, target: DropTarget | null) => {
    if (!target) return;
    if (state.kind === "module" && target.kind === "module") {
      const { modules: next, changed } = moveModule(modules, categories, state.id, target.category, target.beforeId);
      if (changed.length === 0) return;
      setModules(next);
      void saveOrder(changed);
    }
    if (state.kind === "category" && target.kind === "category") {
      const from = categories.indexOf(state.name);
      const to = target.index > from ? target.index - 1 : target.index;
      if (from < 0 || to === from) return;
      const list = moveInList(categories, from, to);
      const { modules: next, changed } = renumberByCategories(modules, list);
      setModules(next);
      void saveCategories(list);
      void saveOrder(changed);
    }
  }, [modules, categories]); // eslint-disable-line react-hooks/exhaustive-deps

  const startDrag = (state: DragStart) => (event: ReactPointerEvent) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    event.preventDefault();
    const initial = { ...state, x: event.clientX, y: event.clientY } as DragState;
    setDrag(initial);
    dropRef.current = null;
    setDrop(null);
    let current = initial;
    const move = (e: PointerEvent) => {
      current = { ...current, x: e.clientX, y: e.clientY };
      setDrag(current);
      const target = findTarget(current, e.clientX, e.clientY);
      dropRef.current = target;
      setDrop(target);
      // 端に来たら画面を送る
      if (e.clientY < 90) window.scrollBy(0, -14);
      else if (e.clientY > window.innerHeight - 90) window.scrollBy(0, 14);
    };
    const end = (e: PointerEvent) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
      if (e.type === "pointerup") finishDrag(current, dropRef.current);
      setDrag(null);
      setDrop(null);
      dropRef.current = null;
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
  };

  const moduleBar = (category: string, beforeId: string | null) =>
    drag?.kind === "module" && drop?.kind === "module" && drop.category === category && drop.beforeId === beforeId
      ? <div className="h-1 rounded-full bg-primary" /> : null;
  const categoryBar = (index: number) =>
    drag?.kind === "category" && drop?.kind === "category" && drop.index === index
      ? <div className="h-1 rounded-full bg-primary" /> : null;

  const categorySelect = (value: string, onChange: (v: string) => void, className = "mt-1") => (
    <Select value={value || undefined} onValueChange={onChange}>
      <SelectTrigger className={className}><SelectValue placeholder="カテゴリを選ぶ" /></SelectTrigger>
      <SelectContent>
        {categories.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
      </SelectContent>
    </Select>
  );

  return (
    <div className={`max-w-3xl space-y-5 ${drag ? "select-none" : ""}`}>
      <Card>
        <CardContent className="pt-5 space-y-3">
          <p className="font-semibold text-sm">カテゴリ</p>
          <p className="text-xs text-muted-foreground">先にカテゴリを作り、講習はプルダウンで選びます。並べ替えは下の一覧で ⋮⋮ を押したまま動かします。</p>
          <div className="flex flex-wrap gap-1.5">
            {categories.map((c) => (
              <span key={c} className="rounded-full border bg-muted/40 px-2.5 py-1 text-xs">
                {c}<span className="ml-1 text-muted-foreground">{modules.filter((m) => m.category === c).length}</span>
              </span>
            ))}
            {categories.length === 0 && <span className="text-xs text-muted-foreground">まだありません</span>}
          </div>
          <div className="flex gap-2">
            <Input placeholder="例：施術技術" value={newCategory} onChange={(e) => setNewCategory(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.nativeEvent.isComposing) void addCategory(); }} />
            <Button variant="outline" onClick={() => void addCategory()} disabled={!newCategory.trim()}>
              <Plus size={14} className="mr-1" />カテゴリを作る
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-5 space-y-3">
          <p className="font-semibold text-sm">新規カリキュラム項目を追加</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">カテゴリ</Label>
              {categorySelect(newModule.category, (v) => setNewModule((f) => ({ ...f, category: v })))}
            </div>
            <div>
              <Label className="text-xs">項目名</Label>
              <Input className="mt-1" placeholder="例：オイルトリートメント基礎" value={newModule.title}
                onChange={(e) => setNewModule((f) => ({ ...f, title: e.target.value }))} />
            </div>
          </div>
          <div>
            <Label className="text-xs">説明</Label>
            <Textarea className="mt-1 resize-none" rows={2} placeholder="講習内容の説明" value={newModule.description}
              onChange={(e) => setNewModule((f) => ({ ...f, description: e.target.value }))} />
          </div>
          <div>
            <Label className="text-xs">チェック項目（1行に1つ）</Label>
            <Textarea className="mt-1 resize-none" rows={3} placeholder={"例：出勤・遅刻のルール\n身だしなみ\n連絡の取り方"} value={newModule.items}
              onChange={(e) => setNewModule((f) => ({ ...f, items: e.target.value }))} />
          </div>
          <Button onClick={() => void addModule()} disabled={addingModule || categories.length === 0}>
            <Plus size={14} className="mr-1.5" />
            {addingModule ? "追加中..." : "項目を追加"}
          </Button>
        </CardContent>
      </Card>

      <div className="space-y-4">
        {grouped.map(({ category, mods }, index) => (
          <div key={category} className="space-y-2">
            {categoryBar(index)}
            <div data-category-index={index} data-category={category}
              className={`rounded-xl p-1 -m-1 ${drag?.kind === "category" && drag.name === category ? "opacity-40" : ""} ${drag?.kind === "module" && drop?.kind === "module" && drop.category === category ? "bg-primary/5" : ""}`}>
              {renamingCategory?.from === category ? (
                <div className="mb-2 flex items-center gap-1">
                  <Input className="h-8 text-sm" autoFocus value={renamingCategory.to}
                    onChange={(e) => setRenamingCategory({ from: category, to: e.target.value })}
                    onKeyDown={(e) => { if (e.key === "Enter" && !e.nativeEvent.isComposing) void renameCategory(); }} />
                  <Button size="icon" className="h-8 w-8 shrink-0" onClick={() => void renameCategory()} disabled={saving} aria-label="保存">
                    {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                  </Button>
                  <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0" onClick={() => setRenamingCategory(null)} aria-label="やめる">
                    <X size={14} />
                  </Button>
                </div>
              ) : (
                <div className="mb-2 flex items-center gap-1">
                  <button type="button" aria-label="カテゴリを並べ替え" onPointerDown={startDrag({ kind: "category", name: category, label: category })}
                    className="-ml-1 cursor-grab touch-none p-1 text-muted-foreground active:cursor-grabbing">
                    <GripVertical size={14} />
                  </button>
                  <button type="button" onClick={() => setRenamingCategory({ from: category, to: category })}
                    className="flex items-center gap-1.5 text-xs font-bold text-muted-foreground tracking-wider hover:text-foreground">
                    {category}<Pencil size={12} />
                  </button>
                  {mods.length === 0 && (
                    <button type="button" onClick={() => void removeCategory(category)} aria-label="カテゴリを消す"
                      className="ml-auto p-1 text-muted-foreground hover:text-destructive">
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>
              )}
              <div className="space-y-2">
                {mods.map((m) => (
                  <div key={m.id} className="space-y-2">
                    {moduleBar(category, m.id)}
                    <div data-module-id={m.id} data-category={category}
                      className={`rounded-xl border bg-card px-4 py-3 ${drag?.kind === "module" && drag.id === m.id ? "opacity-40" : ""}`}>
                      {editingModule?.id === m.id ? (
                        <div className="space-y-2">
                          <div>
                            <Label className="text-xs">カテゴリ</Label>
                            {categorySelect(editingModule.category, (v) => setEditingModule({ ...editingModule, category: v }), "mt-1 h-9 text-sm")}
                          </div>
                          <div>
                            <Label className="text-xs">項目名</Label>
                            <Input className="mt-1 h-9 text-sm" value={editingModule.title}
                              onChange={(e) => setEditingModule({ ...editingModule, title: e.target.value })} />
                          </div>
                          <div>
                            <Label className="text-xs">説明</Label>
                            <Textarea className="mt-1 text-sm resize-none" rows={2} value={editingModule.description}
                              onChange={(e) => setEditingModule({ ...editingModule, description: e.target.value })} />
                          </div>
                          <div className="flex gap-2">
                            <Button size="sm" onClick={() => void saveModuleEdit()} disabled={saving}>
                              {saving && <Loader2 size={14} className="mr-1.5 animate-spin" />}保存
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => setEditingModule(null)}>やめる</Button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-start gap-2">
                          <button type="button" aria-label="ドラッグで移動" onPointerDown={startDrag({ kind: "module", id: m.id, label: m.title })}
                            className="-ml-2 mt-0.5 cursor-grab touch-none p-1 text-muted-foreground active:cursor-grabbing">
                            <GripVertical size={16} />
                          </button>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium">{m.title}</p>
                            {m.description && <p className="text-xs text-muted-foreground mt-0.5">{m.description}</p>}
                          </div>
                          <button onClick={() => setEditingModule({ id: m.id, category: m.category, title: m.title, description: m.description ?? "" })}
                            className="text-muted-foreground hover:text-foreground p-1 shrink-0" aria-label="編集">
                            <Pencil size={15} />
                          </button>
                          <button onClick={() => void deleteModule(m.id)} className="text-muted-foreground hover:text-destructive p-1 shrink-0" aria-label="削除">
                            <Trash2 size={15} />
                          </button>
                        </div>
                      )}
                      <ModuleChecklistEditor
                        moduleId={m.id}
                        checklist={m.checklist}
                        onSaved={(checklist) => setModules((prev) => prev.map((x) => (x.id === m.id ? { ...x, checklist } : x)))}
                      />
                    </div>
                  </div>
                ))}
                {moduleBar(category, null)}
                {mods.length === 0 && (
                  <p className="rounded-xl border border-dashed px-4 py-4 text-center text-xs text-muted-foreground">
                    講習はまだありません（ここへドラッグで移せます）
                  </p>
                )}
              </div>
            </div>
          </div>
        ))}
        {categoryBar(grouped.length)}
        {modules.length === 0 && categories.length === 0 && (
          <p className="text-center text-muted-foreground text-sm py-8">カリキュラム項目がありません</p>
        )}
      </div>

      {drag && (
        <div className="pointer-events-none fixed z-50 max-w-[70vw] -translate-x-1/2 -translate-y-1/2 truncate rounded-lg border bg-card px-3 py-2 text-sm font-medium shadow-lg"
          style={{ left: drag.x, top: drag.y }}>
          {drag.label}
        </div>
      )}
    </div>
  );
}
