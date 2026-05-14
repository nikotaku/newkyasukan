import { useState, useEffect } from "react";
import { DashboardHeader } from "@/components/DashboardHeader";
import { Sidebar } from "@/components/Sidebar";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ChevronRight, ChevronLeft, Plus, Pencil, Trash2, Copy, Check, Folder, FileText, X, GripVertical } from "lucide-react";

interface Template {
  id: string;
  label: string;
  content: string | null;
  color: string;
  is_folder: boolean;
  parent_id: string | null;
  display_order: number;
}

const COLORS = [
  "#3b82f6", "#22c55e", "#a855f7", "#ef4444",
  "#f97316", "#eab308", "#06b6d4", "#ec4899",
  "#6366f1", "#14b8a6", "#f43f5e", "#84cc16",
];

const IconBox = ({ color, isFolder, size = 40 }: { color: string; isFolder: boolean; size?: number }) => (
  <div
    className="rounded-xl flex items-center justify-center shrink-0 shadow"
    style={{ width: size, height: size, backgroundColor: color }}
  >
    {isFolder
      ? <Folder size={size * 0.5} color="white" fill="white" />
      : <span style={{ fontSize: size * 0.45, color: "white", fontWeight: 700, fontFamily: "serif" }}>あ</span>
    }
  </div>
);

export default function TextTemplates() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [items, setItems] = useState<Template[]>([]);
  const [currentFolder, setCurrentFolder] = useState<Template | null>(null);
  const [history, setHistory] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [editMode, setEditMode] = useState(false);
  const [selected, setSelected] = useState<Template | null>(null);
  const [copied, setCopied] = useState(false);

  // drag state
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [dragOverParent, setDragOverParent] = useState(false);

  // form
  const [showForm, setShowForm] = useState(false);
  const [formTarget, setFormTarget] = useState<Template | null>(null);
  const [form, setForm] = useState({ label: "", content: "", color: "#3b82f6", is_folder: false });

  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!authLoading && !user) navigate("/login");
  }, [user, authLoading, navigate]);

  useEffect(() => {
    if (user) fetchItems();
  }, [user, currentFolder]);

  const fetchItems = async () => {
    setLoading(true);
    const q = supabase
      .from("text_templates" as any)
      .select("*")
      .order("display_order")
      .order("created_at");
    if (currentFolder) {
      q.eq("parent_id", currentFolder.id);
    } else {
      q.is("parent_id", null);
    }
    const { data } = await q;
    setItems((data || []) as Template[]);
    setLoading(false);
  };

  const openFolder = (folder: Template) => {
    setHistory(h => [...h, currentFolder!].filter(Boolean) as Template[]);
    setCurrentFolder(folder);
    setSelected(null);
    setEditMode(false);
  };

  const goBack = () => {
    const prev = history[history.length - 1] || null;
    setCurrentFolder(prev);
    setHistory(h => h.slice(0, -1));
    setSelected(null);
    setEditMode(false);
  };

  const openItem = (item: Template) => {
    if (editMode) return;
    if (item.is_folder) {
      openFolder(item);
    } else {
      setSelected(item);
    }
  };

  const handleCopy = () => {
    if (!selected?.content) return;
    navigator.clipboard.writeText(selected.content);
    setCopied(true);
    toast.success("コピーしました");
    setTimeout(() => setCopied(false), 2000);
  };

  const openCreate = (isFolder: boolean) => {
    setFormTarget(null);
    setForm({ label: "", content: "", color: isFolder ? "#22c55e" : "#3b82f6", is_folder: isFolder });
    setShowForm(true);
  };

  const openEdit = (item: Template, e: React.MouseEvent) => {
    e.stopPropagation();
    setFormTarget(item);
    setForm({ label: item.label, content: item.content || "", color: item.color, is_folder: item.is_folder });
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!form.label.trim()) { toast.error("ラベルを入力してください"); return; }
    const payload = {
      label: form.label,
      content: form.is_folder ? null : form.content,
      color: form.color,
      is_folder: form.is_folder,
      parent_id: currentFolder?.id || null,
    };
    let error;
    if (formTarget) {
      ({ error } = await supabase.from("text_templates" as any).update(payload).eq("id", formTarget.id));
    } else {
      ({ error } = await supabase.from("text_templates" as any).insert([{ ...payload, display_order: items.length }]));
    }
    if (error) {
      console.error("text_templates save error:", error);
      toast.error(`保存に失敗しました: ${error.message}`);
      return;
    }
    toast.success(formTarget ? "更新しました" : "作成しました");
    setShowForm(false);
    if (selected?.id === formTarget?.id) setSelected(null);
    fetchItems();
  };

  const handleDelete = async (item: Template, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm(`「${item.label}」を削除しますか？${item.is_folder ? "\nフォルダ内のテンプレートも削除されます。" : ""}`)) return;
    await supabase.from("text_templates" as any).delete().eq("id", item.id);
    toast.success("削除しました");
    if (selected?.id === item.id) setSelected(null);
    fetchItems();
  };

  const handleDragStart = (e: React.DragEvent, item: Template) => {
    setDraggingId(item.id);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", item.id);
  };

  const handleDragEnd = () => {
    setDraggingId(null);
    setDragOverId(null);
    setDragOverParent(false);
  };

  const handleDropOnItem = async (e: React.DragEvent, target: Template) => {
    e.preventDefault();
    setDragOverId(null);
    if (!draggingId || draggingId === target.id) return;

    const draggedItem = items.find(i => i.id === draggingId);
    if (!draggedItem) return;

    if (target.is_folder) {
      // Move dragged item into this folder
      const { error } = await (supabase.from("text_templates" as any) as any)
        .update({ parent_id: target.id })
        .eq("id", draggingId);
      if (error) { toast.error("移動に失敗しました"); return; }
      toast.success(`「${draggedItem.label}」を「${target.label}」に移動しました`);
    } else {
      // Reorder: insert dragged before target
      const newOrder = items.filter(i => i.id !== draggingId);
      const targetIdx = newOrder.findIndex(i => i.id === target.id);
      newOrder.splice(targetIdx, 0, draggedItem);
      await Promise.all(
        newOrder.map((item, idx) =>
          (supabase.from("text_templates" as any) as any).update({ display_order: idx }).eq("id", item.id)
        )
      );
    }
    setDraggingId(null);
    fetchItems();
  };

  const handleDropOnParent = async (e: React.DragEvent) => {
    e.preventDefault();
    setDragOverParent(false);
    if (!draggingId) return;
    const parentId = history[history.length - 1]?.id || null;
    const { error } = await (supabase.from("text_templates" as any) as any)
      .update({ parent_id: parentId })
      .eq("id", draggingId);
    const draggedItem = items.find(i => i.id === draggingId);
    if (error) { toast.error("移動に失敗しました"); return; }
    toast.success(`「${draggedItem?.label}」を上の階層に移動しました`);
    setDraggingId(null);
    fetchItems();
  };

  const title = currentFolder ? currentFolder.label : "文章テンプレート";

  return (
    <div className="min-h-screen bg-background">
      <DashboardHeader onToggleSidebar={() => setSidebarOpen(!sidebarOpen)} />
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <main className="pt-[60px] md:ml-[240px]">
        <div className="max-w-2xl mx-auto">

          {/* ── Top Bar ── */}
          <div
            className="flex items-center justify-between px-4 py-3 sticky top-[60px] z-10 border-b"
            style={{ backgroundColor: "#111111" }}
          >
            <div className="flex items-center gap-2">
              {currentFolder && (
                <button onClick={goBack} className="text-[#3b82f6] flex items-center gap-0.5 text-sm">
                  <ChevronLeft size={18} />
                  戻る
                </button>
              )}
              {!currentFolder && <div className="w-14" />}
            </div>
            <h1 className="text-white font-semibold text-base absolute left-1/2 -translate-x-1/2">{title}</h1>
            <div className="flex items-center gap-2">
              <button
                onClick={() => { setEditMode(e => !e); setSelected(null); }}
                className="text-[#3b82f6] text-sm"
              >
                {editMode ? "完了" : "編集"}
              </button>
              {!editMode && (
                <button
                  onClick={() => openCreate(false)}
                  className="w-7 h-7 rounded-full bg-[#3b82f6] flex items-center justify-center"
                >
                  <Plus size={16} color="white" />
                </button>
              )}
            </div>
          </div>

          {/* ── Color bar for folder ── */}
          {currentFolder && (
            <div className="px-4 py-2 flex items-center gap-3" style={{ backgroundColor: "#1c1c1e" }}>
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: currentFolder.color }} />
              <span className="text-white text-sm font-medium">{currentFolder.label}</span>
            </div>
          )}

          {/* ── List ── */}
          <div style={{ backgroundColor: "#1c1c1e", minHeight: "calc(100vh - 120px)" }}>
            {loading ? (
              <div className="text-center py-16 text-[#8e8e93] text-sm">読み込み中...</div>
            ) : (
              <>
                {/* Drop zone for moving to parent folder */}
                {editMode && currentFolder && draggingId && (
                  <div
                    onDragOver={e => { e.preventDefault(); setDragOverParent(true); }}
                    onDragLeave={() => setDragOverParent(false)}
                    onDrop={handleDropOnParent}
                    className="flex items-center gap-2 px-4 py-3 border-b text-sm transition-colors"
                    style={{
                      borderColor: "#2c2c2e",
                      backgroundColor: dragOverParent ? "#1d3a5f" : "#161618",
                      color: dragOverParent ? "#60a5fa" : "#8e8e93",
                    }}
                  >
                    <ChevronLeft size={14} />
                    <span>ここにドロップして上の階層へ移動</span>
                  </div>
                )}

                {items.length === 0 ? (
                  <div className="text-center py-16 text-[#8e8e93] text-sm">
                    <p>テンプレートがありません</p>
                    <div className="flex gap-3 justify-center mt-4">
                      <button onClick={() => openCreate(false)} className="text-[#3b82f6] text-sm">+ テンプレート追加</button>
                      <button onClick={() => openCreate(true)} className="text-[#3b82f6] text-sm">+ フォルダ追加</button>
                    </div>
                  </div>
                ) : (
                  <>
                    {items.map((item) => {
                      const isDragging = draggingId === item.id;
                      const isDragOver = dragOverId === item.id;
                      const folderHighlight = isDragOver && item.is_folder;
                      return (
                        <div
                          key={item.id}
                          draggable={editMode}
                          onDragStart={e => handleDragStart(e, item)}
                          onDragEnd={handleDragEnd}
                          onDragOver={e => { e.preventDefault(); setDragOverId(item.id); }}
                          onDragLeave={() => setDragOverId(null)}
                          onDrop={e => handleDropOnItem(e, item)}
                          onClick={() => openItem(item)}
                          className="w-full flex items-center gap-3 px-4 py-3 border-b transition-all text-left cursor-pointer"
                          style={{
                            borderColor: folderHighlight ? item.color : "#2c2c2e",
                            borderLeftWidth: folderHighlight ? 3 : 0,
                            borderLeftStyle: "solid" as const,
                            backgroundColor: folderHighlight
                              ? `${item.color}22`
                              : isDragOver && !item.is_folder
                              ? "#2c2c2e"
                              : selected?.id === item.id
                              ? "#2c2c2e"
                              : "transparent",
                            opacity: isDragging ? 0.35 : 1,
                            cursor: editMode ? "grab" : "pointer",
                          }}
                        >
                          {editMode && (
                            <GripVertical size={16} className="text-[#8e8e93] shrink-0" />
                          )}
                          <IconBox color={item.color} isFolder={item.is_folder} />
                          <div className="flex-1 min-w-0">
                            <p className="text-white text-sm font-medium truncate">{item.label}</p>
                            {!item.is_folder && item.content && (
                              <p className="text-[#8e8e93] text-xs mt-0.5 truncate">{item.content}</p>
                            )}
                          </div>
                          {editMode ? (
                            <div className="flex items-center gap-2 shrink-0" onClick={e => e.stopPropagation()}>
                              <button
                                onClick={e => openEdit(item, e)}
                                className="w-7 h-7 rounded-full bg-[#3b82f6] flex items-center justify-center"
                              >
                                <Pencil size={13} color="white" />
                              </button>
                              <button
                                onClick={e => handleDelete(item, e)}
                                className="w-7 h-7 rounded-full bg-[#ef4444] flex items-center justify-center"
                              >
                                <Trash2 size={13} color="white" />
                              </button>
                            </div>
                          ) : (
                            <ChevronRight size={16} className="text-[#8e8e93] shrink-0" />
                          )}
                        </div>
                      );
                    })}

                    {/* Add folder button at bottom */}
                    {!editMode && !currentFolder && (
                      <button
                        onClick={() => openCreate(true)}
                        className="w-full flex items-center gap-3 px-4 py-3 border-b"
                        style={{ borderColor: "#2c2c2e" }}
                      >
                        <div className="w-10 h-10 rounded-xl bg-[#2c2c2e] flex items-center justify-center">
                          <Plus size={20} className="text-[#8e8e93]" />
                        </div>
                        <span className="text-[#8e8e93] text-sm">フォルダを追加</span>
                      </button>
                    )}
                  </>
                )}
              </>
            )}
          </div>
        </div>

        {/* ── Detail panel (テンプレート閲覧) ── */}
        {selected && (
          <div
            className="fixed inset-0 top-[60px] md:left-[240px] z-20 flex flex-col"
            style={{ backgroundColor: "#111111" }}
          >
            {/* header */}
            <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: "#2c2c2e" }}>
              <button onClick={() => setSelected(null)} className="text-[#3b82f6] flex items-center gap-0.5 text-sm">
                <ChevronLeft size={18} />戻る
              </button>
              <h2 className="text-white font-semibold text-sm absolute left-1/2 -translate-x-1/2 max-w-[60%] truncate">
                {selected.label}
              </h2>
              <button onClick={() => openEdit(selected, { stopPropagation: () => {} } as any)} className="text-[#3b82f6] text-sm">
                編集
              </button>
            </div>

            {/* content */}
            <div className="flex-1 overflow-y-auto p-5">
              <div className="flex items-center gap-3 mb-5">
                <IconBox color={selected.color} isFolder={false} size={48} />
                <span className="text-white font-bold text-lg">{selected.label}</span>
              </div>

              <div
                className="rounded-xl p-4 mb-5 text-sm leading-relaxed whitespace-pre-wrap"
                style={{ backgroundColor: "#2c2c2e", color: "#e5e5ea" }}
              >
                {selected.content || <span className="text-[#8e8e93]">内容がありません</span>}
              </div>

              <button
                onClick={handleCopy}
                className="w-full py-3.5 rounded-xl font-bold text-white flex items-center justify-center gap-2 transition-colors"
                style={{ backgroundColor: copied ? "#22c55e" : selected.color }}
              >
                {copied ? <Check size={18} /> : <Copy size={18} />}
                {copied ? "コピーしました！" : "コピー"}
              </button>
            </div>
          </div>
        )}

        {/* ── Form modal ── */}
        {showForm && (
          <div className="fixed inset-0 top-[60px] md:left-[240px] z-30 flex flex-col" style={{ backgroundColor: "#111111" }}>
            <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: "#2c2c2e" }}>
              <button onClick={() => setShowForm(false)} className="text-[#3b82f6] text-sm flex items-center gap-0.5">
                <ChevronLeft size={18} />キャンセル
              </button>
              <h2 className="text-white font-semibold text-sm absolute left-1/2 -translate-x-1/2">
                {formTarget ? "編集" : form.is_folder ? "フォルダを作成" : "テンプレートを作成"}
              </h2>
              <button onClick={handleSave} className="text-[#3b82f6] font-semibold text-sm">保存</button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-5">
              {/* Color picker */}
              <div>
                <p className="text-[#8e8e93] text-xs mb-2 uppercase tracking-wider">カラー</p>
                <div className="flex flex-wrap gap-3">
                  {COLORS.map(c => (
                    <button
                      key={c}
                      onClick={() => setForm(f => ({ ...f, color: c }))}
                      className="w-10 h-10 rounded-xl transition-transform"
                      style={{
                        backgroundColor: c,
                        transform: form.color === c ? "scale(1.15)" : "scale(1)",
                        outline: form.color === c ? `3px solid white` : "none",
                        outlineOffset: "2px",
                      }}
                    />
                  ))}
                </div>
              </div>

              {/* Preview */}
              <div className="flex items-center gap-3 py-3 px-4 rounded-xl" style={{ backgroundColor: "#2c2c2e" }}>
                <IconBox color={form.color} isFolder={form.is_folder} size={44} />
                <span className="text-white font-medium text-sm">{form.label || "ラベル"}</span>
              </div>

              {/* Label */}
              <div>
                <p className="text-[#8e8e93] text-xs mb-1 uppercase tracking-wider">ラベル</p>
                <input
                  value={form.label}
                  onChange={e => setForm(f => ({ ...f, label: e.target.value }))}
                  placeholder="テンプレート名を入力"
                  className="w-full px-4 py-3 rounded-xl text-sm text-white"
                  style={{ backgroundColor: "#2c2c2e", outline: "none" }}
                />
              </div>

              {/* Content (not for folders) */}
              {!form.is_folder && (
                <div>
                  <p className="text-[#8e8e93] text-xs mb-1 uppercase tracking-wider">フレーズ</p>
                  <textarea
                    value={form.content}
                    onChange={e => setForm(f => ({ ...f, content: e.target.value }))}
                    placeholder="テンプレートの内容を入力..."
                    rows={10}
                    className="w-full px-4 py-3 rounded-xl text-sm text-white resize-none leading-relaxed"
                    style={{ backgroundColor: "#2c2c2e", outline: "none" }}
                  />
                </div>
              )}

              {/* Type toggle (new item only) */}
              {!formTarget && (
                <div>
                  <p className="text-[#8e8e93] text-xs mb-2 uppercase tracking-wider">種別</p>
                  <div className="flex rounded-xl overflow-hidden" style={{ backgroundColor: "#2c2c2e" }}>
                    <button
                      onClick={() => setForm(f => ({ ...f, is_folder: false, color: "#3b82f6" }))}
                      className="flex-1 py-2.5 text-sm font-medium transition-colors"
                      style={{ backgroundColor: !form.is_folder ? "#3b82f6" : "transparent", color: "white" }}
                    >
                      テンプレート
                    </button>
                    <button
                      onClick={() => setForm(f => ({ ...f, is_folder: true, color: "#22c55e" }))}
                      className="flex-1 py-2.5 text-sm font-medium transition-colors"
                      style={{ backgroundColor: form.is_folder ? "#22c55e" : "transparent", color: "white" }}
                    >
                      フォルダ
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
